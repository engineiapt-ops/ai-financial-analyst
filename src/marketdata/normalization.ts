import type { Kline } from "../types.js";

export interface MarketDataNormalizationOptions {
  maxCandles?: number;
  requireClosedCandleTimestamps?: boolean;
}

export class MarketDataNormalizationError extends Error {
  readonly code = "MARKET_DATA_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "MarketDataNormalizationError";
  }
}

function assertFinitePositive(value: number, field: string, index: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MarketDataNormalizationError(`Invalid ${field} at candle ${index}`);
  }
}

function assertFiniteNonNegative(value: number, field: string, index: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new MarketDataNormalizationError(`Invalid ${field} at candle ${index}`);
  }
}

function assertDate(value: Date, field: string, index: number): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new MarketDataNormalizationError(`Invalid ${field} at candle ${index}`);
  }
}

/**
 * Converts broker/provider candles into the canonical Kline representation.
 *
 * The function is deliberately fail-closed: malformed market data is rejected
 * instead of being repaired silently and potentially reaching the signal engine.
 */
export function normalizeMarketData(
  candles: readonly Kline[],
  options: MarketDataNormalizationOptions = {},
): Kline[] {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new MarketDataNormalizationError("Market data requires at least one candle");
  }

  const maxCandles = options.maxCandles ?? 1200;
  if (!Number.isSafeInteger(maxCandles) || maxCandles <= 0) {
    throw new MarketDataNormalizationError("maxCandles must be a positive integer");
  }
  if (candles.length > maxCandles) {
    throw new MarketDataNormalizationError(
      `Market data exceeds maxCandles: ${candles.length} > ${maxCandles}`,
    );
  }

  const normalized = candles.map((candle, index) => {
    assertDate(candle.openTime, "openTime", index);
    if (candle.closeTime !== undefined) {
      assertDate(candle.closeTime, "closeTime", index);
      if (candle.closeTime.getTime() <= candle.openTime.getTime()) {
        throw new MarketDataNormalizationError(`closeTime must be after openTime at candle ${index}`);
      }
    }

    assertFinitePositive(candle.open, "open", index);
    assertFinitePositive(candle.high, "high", index);
    assertFinitePositive(candle.low, "low", index);
    assertFinitePositive(candle.close, "close", index);
    assertFiniteNonNegative(candle.volume, "volume", index);

    const highestBody = Math.max(candle.open, candle.close);
    const lowestBody = Math.min(candle.open, candle.close);
    if (candle.high < highestBody || candle.low > lowestBody || candle.high < candle.low) {
      throw new MarketDataNormalizationError(`Invalid OHLC relationship at candle ${index}`);
    }

    return {
      openTime: new Date(candle.openTime.getTime()),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      closeTime: candle.closeTime ? new Date(candle.closeTime.getTime()) : undefined,
    };
  });

  normalized.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1].openTime.getTime();
    const current = normalized[index].openTime.getTime();
    if (current === previous) {
      throw new MarketDataNormalizationError(`Duplicate candle timestamp at index ${index}`);
    }
  }

  if (options.requireClosedCandleTimestamps) {
    for (const [index, candle] of normalized.entries()) {
      if (candle.closeTime === undefined) {
        throw new MarketDataNormalizationError(`Missing closeTime at candle ${index}`);
      }
    }
  }

  return normalized;
}
