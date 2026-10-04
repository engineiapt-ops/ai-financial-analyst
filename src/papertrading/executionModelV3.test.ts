import { strict as assert } from "node:assert";
import { simulateCfdTradeV3, EXECUTION_MODEL_V3_VERSION, type CfdQuoteCandle } from "./executionModelV3.js";

function candle(openTime: string, values: Partial<CfdQuoteCandle> = {}): CfdQuoteCandle {
  const base = {
    openTime: new Date(openTime),
    closeTime: new Date(new Date(openTime).getTime() + 3_600_000 - 1),
    open: 100, high: 101, low: 99, close: 100,
    bidOpen: 99.9, askOpen: 100.1, bidHigh: 100.9, askHigh: 101.1,
    bidLow: 98.9, askLow: 99.1, bidClose: 99.9, askClose: 100.1,
    volume: 1,
  };
  return { ...base, ...values };
}

const config = {
  commissionPctPerSide: 0.01,
  slippagePctPerSide: 0,
  overnightFinancingPctPerDay: 0,
  leverage: 10,
  stopOutMarginLevelPct: 0,
};

const win = simulateCfdTradeV3({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidHigh: 101.5, bidLow: 100, bidClose: 101,
    high: 101.6, low: 100, close: 101.1,
  })],
  targetPct: 0.01,
  stopPct: 0.005,
  config,
});
assert.equal(win.version, EXECUTION_MODEL_V3_VERSION);
assert.equal(win.exitReason, "target");
assert.equal(win.outcome, "win");
assert.ok(win.netProfitPercent < win.grossProfitPercent);

const sameCandle = simulateCfdTradeV3({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidHigh: 101.5, bidLow: 99,
    high: 101.6, low: 98.9,
  })],
  targetPct: 0.01,
  stopPct: 0.005,
  config,
});
assert.equal(sameCandle.exitReason, "stop");

const gap = simulateCfdTradeV3({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidOpen: 98, bidLow: 97, bidHigh: 99, bidClose: 98.5,
  })],
  targetPct: 0.01,
  stopPct: 0.005,
  config,
});
assert.equal(gap.exitReason, "gap");
assert.ok(gap.exitPrice !== null && gap.exitPrice < gap.stopPrice);

const blocked = simulateCfdTradeV3({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [],
  targetPct: 0.01,
  stopPct: 0.005,
  config: { ...config, tradingHours: () => false },
});
assert.equal(blocked.outcome, "blocked");
assert.equal(blocked.exitReason, "outside_hours");

console.log("execution model v3 tests passed");
