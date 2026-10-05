import { strict as assert } from "node:assert";
import type { Kline } from "../types.js";
import { evaluateMarketDataConsistency, assertMarketDataConsistency } from "./consistency.js";

function candle(close: number, openTime: string): Kline {
  return {
    openTime: new Date(openTime),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1,
  };
}

const consistent = evaluateMarketDataConsistency([
  { provider: "ig-demo", candles: [candle(99.5, "2026-10-04T09:00:00.000Z"), candle(100, "2026-10-04T10:00:00.000Z")] },
  { provider: "saxo-sim", candles: [candle(99.7, "2026-10-04T09:00:00.000Z"), candle(100.02, "2026-10-04T10:00:00.000Z")] },
], 5);

assert.equal(consistent.status, "consistent");
assert.equal(consistent.comparedProviderCount, 2);
assert.equal(consistent.referenceClose, 100);
assert.equal(consistent.referenceTimestamp, "2026-10-04T10:00:00.000Z");

const latestTimestampsDiffer = evaluateMarketDataConsistency([
  { provider: "ig-demo", candles: [candle(100, "2026-10-04T10:00:00.000Z"), candle(101, "2026-10-04T11:00:00.000Z")] },
  { provider: "saxo-sim", candles: [candle(100.02, "2026-10-04T10:00:00.000Z")] },
], 5);

assert.equal(latestTimestampsDiffer.status, "consistent");
assert.equal(latestTimestampsDiffer.referenceTimestamp, "2026-10-04T10:00:00.000Z");

const insufficient = evaluateMarketDataConsistency([
  { provider: "ig-demo", candles: [candle(100, "2026-10-04T10:00:00.000Z")] },
]);
assert.equal(insufficient.status, "insufficient_data");

const noCommonTimestamp = evaluateMarketDataConsistency([
  { provider: "ig-demo", candles: [candle(100, "2026-10-04T10:00:00.000Z")] },
  { provider: "saxo-sim", candles: [candle(100.02, "2026-10-04T11:00:00.000Z")] },
], 5);

assert.equal(noCommonTimestamp.status, "insufficient_data");
assert.equal(noCommonTimestamp.comparedProviderCount, 0);

assert.throws(
  () => assertMarketDataConsistency([
    { provider: "ig-demo", candles: [candle(100, "2026-10-04T10:00:00.000Z")] },
    { provider: "saxo-sim", candles: [candle(102, "2026-10-04T10:00:00.000Z")] },
  ], 50),
  /providers diverged/,
);

console.log("market data consistency tests passed");
