import { computeIndicatorsSeries } from "../features/indicators.js";
import type { Indicators, Kline } from "../types.js";

export const REGIME_MODEL_VERSION = "regime-v1";
export const TREND_SPREAD_THRESHOLD_PCT = 0.15;
export const MOMENTUM_LOW_RSI = 45;
export const MOMENTUM_HIGH_RSI = 55;

export type RegimeTrend = "BULLISH" | "BEARISH" | "SIDEWAYS";
export type RegimeVolatility = "LOW" | "NORMAL" | "HIGH";
export type RegimeMomentum = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface RegimeThresholds {
  version: string;
  calibrationCandles: number;
  frozenAt: Date;
  lowVolAtrRelative: number;
  highVolAtrRelative: number;
}

export interface RegimeSnapshot {
  modelVersion: string;
  dataAsOf: Date;
  trend: RegimeTrend;
  volatility: RegimeVolatility;
  momentum: RegimeMomentum;
  key: string;
  atrRelative: number | null;
  emaSpreadPct: number | null;
  rsi: number | null;
  thresholdsVersion: string;
}

function quantile(values: number[], q: number): number {
  if (!values.length) throw new Error("Cannot calculate a quantile from an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function calibrateRegimeThresholds(
  klines: Kline[],
  calibrationCandles: number,
  frozenAt = new Date(),
): RegimeThresholds {
  if (!Number.isInteger(calibrationCandles) || calibrationCandles < 30) {
    throw new Error("calibrationCandles must be an integer >= 30");
  }
  if (klines.length < calibrationCandles) {
    throw new Error("Not enough candles for regime calibration");
  }

  const calibration = klines.slice(0, calibrationCandles);
  const series = computeIndicatorsSeries(calibration);
  const atrRelativeValues: number[] = [];

  for (let i = 0; i < calibration.length; i += 1) {
    const indicators = series[i];
    const price = calibration[i].close;
    if (
      indicators.atr === null ||
      !Number.isFinite(indicators.atr) ||
      !Number.isFinite(price) ||
      price <= 0
    ) continue;
    atrRelativeValues.push(indicators.atr / price);
  }

  if (atrRelativeValues.length < 20) {
    throw new Error("Not enough valid ATR observations for regime calibration");
  }

  const lowVolAtrRelative = quantile(atrRelativeValues, 1 / 3);
  const highVolAtrRelative = quantile(atrRelativeValues, 2 / 3);

  return {
    version: REGIME_MODEL_VERSION,
    calibrationCandles,
    frozenAt,
    lowVolAtrRelative,
    highVolAtrRelative: Math.max(highVolAtrRelative, lowVolAtrRelative),
  };
}

export function classifyRegime(
  candle: Kline,
  indicators: Indicators,
  thresholds: RegimeThresholds,
): RegimeSnapshot {
  const price = candle.close;
  const emaSpreadPct =
    indicators.ema9 !== null &&
    indicators.ema21 !== null &&
    Number.isFinite(price) &&
    price > 0
      ? ((indicators.ema9 - indicators.ema21) / price) * 100
      : null;

  let trend: RegimeTrend = "SIDEWAYS";
  if (emaSpreadPct !== null && emaSpreadPct > TREND_SPREAD_THRESHOLD_PCT) trend = "BULLISH";
  if (emaSpreadPct !== null && emaSpreadPct < -TREND_SPREAD_THRESHOLD_PCT) trend = "BEARISH";

  let momentum: RegimeMomentum = "NEUTRAL";
  if (indicators.rsi !== null && indicators.rsi > MOMENTUM_HIGH_RSI) momentum = "POSITIVE";
  if (indicators.rsi !== null && indicators.rsi < MOMENTUM_LOW_RSI) momentum = "NEGATIVE";

  const atrRelative =
    indicators.atr !== null && Number.isFinite(price) && price > 0
      ? indicators.atr / price
      : null;

  let volatility: RegimeVolatility = "NORMAL";
  if (atrRelative !== null && atrRelative < thresholds.lowVolAtrRelative) volatility = "LOW";
  if (atrRelative !== null && atrRelative > thresholds.highVolAtrRelative) volatility = "HIGH";

  return {
    modelVersion: REGIME_MODEL_VERSION,
    dataAsOf: candle.closeTime ?? candle.openTime,
    trend,
    volatility,
    momentum,
    key: `${trend}.${volatility}.${momentum}`,
    atrRelative,
    emaSpreadPct,
    rsi: indicators.rsi,
    thresholdsVersion: thresholds.version,
  };
}

export function buildRegimeSeries(
  klines: Kline[],
  thresholds: RegimeThresholds,
): RegimeSnapshot[] {
  const indicatorsSeries = computeIndicatorsSeries(klines);
  return klines.map((candle, index) =>
    classifyRegime(candle, indicatorsSeries[index], thresholds),
  );
}

export function findRegimeAtOrBefore(
  series: RegimeSnapshot[],
  timestamp: Date,
): RegimeSnapshot | null {
  const target = timestamp.getTime();
  let low = 0;
  let high = series.length - 1;
  let best = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = series[mid].dataAsOf.getTime();
    if (current <= target) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best >= 0 ? series[best] : null;
}
