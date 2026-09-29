import { strict as assert } from "node:assert";
import type { Kline } from "../types.js";
import {
  MARKET_DATA_QUALITY_VERSION,
  MarketDataQualityError,
  assertMarketDataFresh,
  evaluateMarketDataQuality,
  maxMarketDataAgeMs,
} from "./quality.js";

function candle(closeTime: string): Kline {
  const close = new Date(closeTime);
  return {
    openTime: new Date(close.getTime() - 60 * 60 * 1000),
    closeTime: close,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
  };
}

const checkedAt = new Date("2026-09-26T14:00:00.000Z");

const fresh = evaluateMarketDataQuality({
  timeframe: "1h",
  candles: [candle("2026-09-26T13:30:00.000Z")],
  checkedAt,
});

assert.equal(fresh.version, MARKET_DATA_QUALITY_VERSION);
assert.equal(fresh.status, "fresh");
assert.equal(fresh.ageMs, 30 * 60 * 1000);
assert.equal(fresh.maxAgeMs, maxMarketDataAgeMs("1h"));

const freshBoundary = assertMarketDataFresh({
  timeframe: "4h",
  candles: [candle("2026-09-26T08:00:00.000Z")],
  checkedAt,
});
assert.equal(freshBoundary.status, "fresh");

const stale = evaluateMarketDataQuality({
  timeframe: "1d",
  candles: [candle("2026-09-24T13:59:59.000Z")],
  checkedAt,
});

assert.equal(stale.status, "stale");

assert.throws(
  () =>
    assertMarketDataFresh({
      timeframe: "1d",
      candles: [candle("2026-09-24T13:59:59.000Z")],
      checkedAt,
    }),
  (error: unknown) => {
    assert.ok(error instanceof MarketDataQualityError);
    assert.equal(error.code, "MARKET_DATA_STALE");
    assert.equal(error.quality.status, "stale");
    return true;
  },
);

assert.throws(
  () =>
    evaluateMarketDataQuality({
      timeframe: "1h",
      candles: [candle("2026-09-26T14:01:00.000Z")],
      checkedAt,
    }),
  /in the future relative to checkedAt/,
);

assert.throws(
  () =>
    evaluateMarketDataQuality({
      timeframe: "1h",
      candles: [],
      checkedAt,
    }),
  /at least one closed candle/,
);

console.log("market data quality tests passed");
