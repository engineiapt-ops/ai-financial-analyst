import { strict as assert } from "node:assert";
import { classifyRegime, findRegimeAtOrBefore } from "./regime.js";

const thresholds = {
  version: "regime-v1",
  calibrationCandles: 100,
  frozenAt: new Date("2026-01-01T00:00:00.000Z"),
  lowVolAtrRelative: 0.01,
  highVolAtrRelative: 0.03,
};

const bullish = classifyRegime(
  {
    openTime: new Date("2026-10-01T00:00:00.000Z"),
    closeTime: new Date("2026-10-01T00:59:00.000Z"),
    open: 100,
    high: 103,
    low: 99,
    close: 100,
    volume: 10,
  },
  { ema9: 101, ema21: 99, rsi: 60, vwap: 100, atr: 2 },
  thresholds,
);

assert.equal(bullish.trend, "BULLISH");
assert.equal(bullish.volatility, "NORMAL");
assert.equal(bullish.momentum, "POSITIVE");
assert.equal(bullish.key, "BULLISH.NORMAL.POSITIVE");

const earlier = { ...bullish, dataAsOf: new Date("2026-09-30T00:00:00.000Z") };
assert.equal(
  findRegimeAtOrBefore([earlier, bullish], new Date("2026-10-01T00:30:00.000Z"))?.key,
  bullish.key,
);

console.log("risk regime tests passed");
