import { strict as assert } from "node:assert";
import type { Kline } from "../types.js";
import { evaluateMarketDataConsistency, assertMarketDataConsistency } from "./consistency.js";

function candle(close: number): Kline {
  return {
    openTime: new Date("2026-10-04T10:00:00.000Z"),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1,
  };
}

const consistent = evaluateMarketDataConsistency([
  { provider: "ig-demo", candles: [candle(100)] },
  { provider: "saxo-sim", candles: [candle(100.02)] },
], 5);

assert.equal(consistent.status, "consistent");
assert.equal(consistent.comparedProviderCount, 2);

const insufficient = evaluateMarketDataConsistency([
  { provider: "ig-demo", candles: [candle(100)] },
]);
assert.equal(insufficient.status, "insufficient_data");

assert.throws(
  () => assertMarketDataConsistency([
    { provider: "ig-demo", candles: [candle(100)] },
    { provider: "saxo-sim", candles: [candle(102)] },
  ], 50),
  /providers diverged/,
);

console.log("market data consistency tests passed");
