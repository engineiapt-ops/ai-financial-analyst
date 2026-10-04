import type { Kline } from "../types.js";
import { MarketDataNormalizationError, normalizeMarketData } from "./normalization.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const t0 = new Date("2026-01-01T10:00:00.000Z");
const t1 = new Date("2026-01-01T11:00:00.000Z");

const unordered: Kline[] = [
  { openTime: t1, open: 101, high: 103, low: 100, close: 102, volume: 20 },
  { openTime: t0, open: 100, high: 102, low: 99, close: 101, volume: 10 },
];

const normalized = normalizeMarketData(unordered);
assert(normalized.length === 2, "valid candles should be preserved");
assert(normalized[0].openTime.getTime() === t0.getTime(), "candles should be sorted by openTime");
assert(normalized[1].openTime.getTime() === t1.getTime(), "latest candle should be last");

const withCloseTime = normalizeMarketData([
  {
    openTime: t0,
    closeTime: t1,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 10,
  },
], { requireClosedCandleTimestamps: true });
assert(withCloseTime[0].closeTime?.getTime() === t1.getTime(), "closeTime should be preserved");

function expectFailure(candles: Kline[], expected: string, options?: Parameters<typeof normalizeMarketData>[1]): void {
  try {
    normalizeMarketData(candles, options);
    throw new Error(`Expected failure: ${expected}`);
  } catch (error) {
    assert(error instanceof MarketDataNormalizationError, "invalid data should use the normalization error");
    assert((error as Error).message.includes(expected), `expected error to contain: ${expected}`);
  }
}

expectFailure([
  { openTime: t0, open: 100, high: 101, low: 99, close: 102, volume: 1 },
], "OHLC relationship");

expectFailure([
  { openTime: t0, open: 100, high: 101, low: 99, close: 100, volume: -1 },
], "volume");

expectFailure([
  { openTime: t0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
  { openTime: t0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
], "Duplicate candle timestamp");

expectFailure([
  { openTime: t0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
], "Missing closeTime", { requireClosedCandleTimestamps: true });

expectFailure(
  Array.from({ length: 2 }, (_, index) => ({
    openTime: new Date(t0.getTime() + index * 3600000),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  })),
  "maxCandles",
  { maxCandles: 1 },
);

console.log("Market data normalization tests passed");
