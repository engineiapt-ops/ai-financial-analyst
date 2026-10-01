import { strict as assert } from "node:assert";
import {
  REGIME_MODEL_VERSION,
  classifyRegime,
  findRegimeAtOrBefore,
  type RegimeThresholds,
} from "./regime.js";
import type { Indicators, Kline } from "../types.js";

const thresholds: RegimeThresholds = {
  version: REGIME_MODEL_VERSION,
  calibrationCandles: 60,
  frozenAt: new Date("2026-10-01T00:00:00.000Z"),
  lowVolAtrRelative: 0.005,
  highVolAtrRelative: 0.02,
};

const candle: Kline = {
  openTime: new Date("2026-10-01T01:00:00.000Z"),
  closeTime: new Date("2026-10-01T01:59:00.000Z"),
  open: 100,
  high: 103,
  low: 99,
  close: 100,
  volume: 10,
};

const indicators: Indicators = {
  ema9: 100.5,
  ema21: 100,
  rsi: 60,
  atr: 2.5,
  vwap: 100,
};

const snapshot = classifyRegime(candle, indicators, thresholds);
assert.equal(snapshot.modelVersion, REGIME_MODEL_VERSION);
assert.equal(snapshot.trend, "BULLISH");
assert.equal(snapshot.volatility, "HIGH");
assert.equal(snapshot.momentum, "POSITIVE");
assert.equal(snapshot.key, "BULLISH.HIGH.POSITIVE");

const earlier = { ...snapshot, dataAsOf: new Date("2026-09-30T23:00:00.000Z") };
const later = { ...snapshot, dataAsOf: new Date("2026-10-01T02:00:00.000Z") };
assert.equal(findRegimeAtOrBefore([earlier, later], new Date("2026-10-01T01:30:00.000Z"))?.dataAsOf.getTime(), earlier.dataAsOf.getTime());
assert.equal(findRegimeAtOrBefore([earlier, later], new Date("2026-09-30T22:00:00.000Z")), null);

console.log("risk regime tests passed");
