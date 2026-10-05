import type { Kline, Timeframe } from "../types.js";

export const VOLATILITY_ANALYTICS_VERSION = "volatility-analytics-v1";

export type VolatilityRelativeState =
  | "iv_premium"
  | "near_historical"
  | "iv_discount"
  | "insufficient_data";

export interface HistoricalVolatilityResult {
  version: typeof VOLATILITY_ANALYTICS_VERSION;
  timeframe: Timeframe;
  lookbackCandles: number;
  observations: number;
  annualizationPeriods: number;
  meanLogReturn: number;
  standardDeviationLogReturn: number;
  annualizedVolatility: number;
  dataAsOf: Date;
}

export interface ImpliedHistoricalVolatilityComparison {
  version: typeof VOLATILITY_ANALYTICS_VERSION;
  impliedVolatility: number | null;
  historicalVolatility: number | null;
  spreadAbsolute: number | null;
  spreadPercentagePoints: number | null;
  ratio: number | null;
  toleranceRelative: number;
  state: VolatilityRelativeState;
}

const PERIODS_PER_YEAR: Record<Timeframe, number> = {
  "1h": 24 * 365,
  "4h": 6 * 365,
  "1d": 365,
};

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function assertPositive(name: string, value: number): void {
  assertFinite(name, value);
  if (value <= 0) {
    throw new Error(`${name} must be greater than zero`);
  }
}

function validateCandles(klines: readonly Kline[]): void {
  let previousTimestamp = Number.NEGATIVE_INFINITY;

  for (const candle of klines) {
    const timestamp = candle.openTime.getTime();
    if (!Number.isFinite(timestamp)) {
      throw new Error("Candle openTime must be a valid Date");
    }
    if (timestamp <= previousTimestamp) {
      throw new Error("Candles must be strictly chronological");
    }
    previousTimestamp = timestamp;

    assertPositive("candle.close", candle.close);
  }
}

export function historicalVolatilityPeriodsPerYear(
  timeframe: Timeframe,
): number {
  return PERIODS_PER_YEAR[timeframe];
}

/**
 * Annualized close-to-close historical volatility based on logarithmic returns.
 *
 * The estimator is sample standard deviation (n-1 denominator), annualized by
 * the number of observations expected per 365-day year for the timeframe.
 */
export function calculateHistoricalVolatility(
  klines: readonly Kline[],
  timeframe: Timeframe,
  lookbackCandles = 100,
): HistoricalVolatilityResult {
  if (!Number.isInteger(lookbackCandles) || lookbackCandles < 3) {
    throw new Error("lookbackCandles must be an integer >= 3");
  }

  validateCandles(klines);

  if (klines.length < 3) {
    throw new Error("At least 3 candles are required for historical volatility");
  }

  const sample = klines.slice(-lookbackCandles);
  if (sample.length < 3) {
    throw new Error("Not enough candles for historical volatility lookback");
  }

  const returns: number[] = [];
  for (let index = 1; index < sample.length; index += 1) {
    const previousClose = sample[index - 1].close;
    const currentClose = sample[index].close;

    const logReturn = Math.log(currentClose / previousClose);
    if (!Number.isFinite(logReturn)) {
      throw new Error("Historical volatility encountered an invalid log return");
    }
    returns.push(logReturn);
  }

  if (returns.length < 2) {
    throw new Error("At least 2 returns are required for historical volatility");
  }

  const meanLogReturn =
    returns.reduce((sum, value) => sum + value, 0) / returns.length;

  const squaredDeviationSum = returns.reduce(
    (sum, value) => sum + (value - meanLogReturn) ** 2,
    0,
  );

  const variance = squaredDeviationSum / (returns.length - 1);
  const standardDeviationLogReturn = Math.sqrt(Math.max(variance, 0));
  const annualizationPeriods = historicalVolatilityPeriodsPerYear(timeframe);
  const annualizedVolatility =
    standardDeviationLogReturn * Math.sqrt(annualizationPeriods);

  if (!Number.isFinite(annualizedVolatility)) {
    throw new Error("Historical volatility calculation returned a non-finite value");
  }

  const dataAsOf = sample[sample.length - 1].closeTime ?? sample[sample.length - 1].openTime;

  return {
    version: VOLATILITY_ANALYTICS_VERSION,
    timeframe,
    lookbackCandles: sample.length,
    observations: returns.length,
    annualizationPeriods,
    meanLogReturn,
    standardDeviationLogReturn,
    annualizedVolatility,
    dataAsOf,
  };
}

export function compareImpliedVsHistoricalVolatility(
  impliedVolatility: number | null | undefined,
  historicalVolatility: number | null | undefined,
  toleranceRelative = 0.1,
): ImpliedHistoricalVolatilityComparison {
  if (
    !Number.isFinite(toleranceRelative) ||
    toleranceRelative < 0 ||
    toleranceRelative > 1
  ) {
    throw new Error("toleranceRelative must be between 0 and 1");
  }

  const iv =
    impliedVolatility == null ? null : impliedVolatility;
  const hv =
    historicalVolatility == null ? null : historicalVolatility;

  if (
    iv === null ||
    hv === null ||
    !Number.isFinite(iv) ||
    !Number.isFinite(hv) ||
    iv <= 0 ||
    hv <= 0
  ) {
    return {
      version: VOLATILITY_ANALYTICS_VERSION,
      impliedVolatility: Number.isFinite(iv ?? NaN) && (iv ?? 0) > 0 ? iv : null,
      historicalVolatility: Number.isFinite(hv ?? NaN) && (hv ?? 0) > 0 ? hv : null,
      spreadAbsolute: null,
      spreadPercentagePoints: null,
      ratio: null,
      toleranceRelative,
      state: "insufficient_data",
    };
  }

  const spreadAbsolute = iv - hv;
  const spreadPercentagePoints = spreadAbsolute * 100;
  const ratio = iv / hv;

  let state: VolatilityRelativeState = "near_historical";
  if (ratio > 1 + toleranceRelative) {
    state = "iv_premium";
  } else if (ratio < 1 - toleranceRelative) {
    state = "iv_discount";
  }

  return {
    version: VOLATILITY_ANALYTICS_VERSION,
    impliedVolatility: iv,
    historicalVolatility: hv,
    spreadAbsolute,
    spreadPercentagePoints,
    ratio,
    toleranceRelative,
    state,
  };
}
