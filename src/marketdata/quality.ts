import type { Kline, Timeframe } from "../types.js";

export const MARKET_DATA_QUALITY_VERSION = "market-data-quality.v1";

export type MarketDataQualityStatus = "fresh" | "stale";

export interface MarketDataQuality {
  version: typeof MARKET_DATA_QUALITY_VERSION;
  status: MarketDataQualityStatus;
  timeframe: Timeframe;
  checkedAt: string;
  dataAsOf: string;
  ageMs: number;
  maxAgeMs: number;
}

export class MarketDataQualityError extends Error {
  readonly code = "MARKET_DATA_STALE" as const;
  readonly quality: MarketDataQuality;

  constructor(quality: MarketDataQuality) {
    super(
      `Market data is stale for ${quality.timeframe}: age ${quality.ageMs}ms exceeds max ${quality.maxAgeMs}ms`,
    );
    this.name = "MarketDataQualityError";
    this.quality = quality;
  }
}

function timeframeDurationMs(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1h":
      return 60 * 60 * 1000;
    case "4h":
      return 4 * 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
  }
}

export function maxMarketDataAgeMs(timeframe: Timeframe): number {
  return timeframeDurationMs(timeframe) * 1.5;
}

export function evaluateMarketDataQuality(input: {
  timeframe: Timeframe;
  candles: Kline[];
  checkedAt: Date;
}): MarketDataQuality {
  if (!input.candles.length) {
    throw new Error("Market data quality requires at least one closed candle");
  }

  const last = input.candles[input.candles.length - 1];
  const dataAsOf = last.closeTime ?? last.openTime;
  const checkedAtMs = input.checkedAt.getTime();
  const dataAsOfMs = dataAsOf.getTime();

  if (!Number.isFinite(dataAsOfMs)) {
    throw new Error("Latest market candle timestamp is invalid");
  }
  if (!Number.isFinite(checkedAtMs)) {
    throw new Error("Market data quality checkedAt is invalid");
  }

  const ageMs = checkedAtMs - dataAsOfMs;
  const maxAgeMs = maxMarketDataAgeMs(input.timeframe);

  if (ageMs < 0) {
    throw new Error("Latest market candle close time is in the future relative to checkedAt");
  }

  return {
    version: MARKET_DATA_QUALITY_VERSION,
    status: ageMs <= maxAgeMs ? "fresh" : "stale",
    timeframe: input.timeframe,
    checkedAt: input.checkedAt.toISOString(),
    dataAsOf: dataAsOf.toISOString(),
    ageMs,
    maxAgeMs,
  };
}

export function assertMarketDataFresh(input: {
  timeframe: Timeframe;
  candles: Kline[];
  checkedAt: Date;
}): MarketDataQuality {
  const quality = evaluateMarketDataQuality(input);
  if (quality.status === "stale") {
    throw new MarketDataQualityError(quality);
  }
  return quality;
}
