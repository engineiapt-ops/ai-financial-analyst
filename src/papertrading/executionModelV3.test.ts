import { strict as assert } from "node:assert";
import {
  simulateCfdTradeV3,
  simulateCfdTradeV3_1,
  EXECUTION_MODEL_V3_VERSION,
  EXECUTION_MODEL_V3_1_VERSION,
  type CfdQuoteCandle,
} from "./executionModelV3.js";

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
    bidHigh: 101.5, askHigh: 101.6,
    bidLow: 100, askLow: 100.1,
    bidClose: 101, askClose: 101.1,
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
assert.ok(Math.abs(win.netProfitPercent - (win.grossProfitPercent - win.commissionPercent)) < 1e-12);

const sameCandle = simulateCfdTradeV3({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidHigh: 101.5, askHigh: 101.6, bidLow: 99,
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
    bidOpen: 98, askOpen: 98.1,
    bidLow: 97, askLow: 97.1,
    bidHigh: 99, askHigh: 99.1,
    bidClose: 98.5, askClose: 98.6,
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

const v31 = simulateCfdTradeV3_1({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidOpen: 101.0,
    askOpen: 101.2,
    bidHigh: 102.3,
    askHigh: 102.5,
    bidLow: 100.3,
    askLow: 100.5,
    bidClose: 101.8,
    askClose: 102.0,
    open: 101.2,
    high: 102.5,
    low: 100.5,
    close: 102.0,
  })],
  targetPct: 0.02,
  stopPct: 0.01,
  config: {
    ...config,
    longFinancingPctPerDay: 0.02,
    shortFinancingPctPerDay: 0.01,
  },
});
assert.equal(v31.version, EXECUTION_MODEL_V3_1_VERSION);
assert.equal(v31.exitReason, "target");
assert.equal(v31.outcome, "win");
assert.ok(v31.financingPercent >= 0);

const profitableGap = simulateCfdTradeV3_1({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidOpen: 101.8,
    askOpen: 102.0,
    bidHigh: 102.7,
    askHigh: 102.9,
    bidLow: 101.1,
    askLow: 101.3,
    bidClose: 101.9,
    askClose: 102.1,
    open: 102.0,
    high: 102.9,
    low: 101.3,
    close: 102.1,
  })],
  targetPct: 0.01,
  stopPct: 0.005,
  config,
});
assert.equal(profitableGap.exitReason, "gap");
assert.ok(profitableGap.grossProfitPercent > 0);
assert.equal(profitableGap.outcome, "win");

const longGap = simulateCfdTradeV3_1({
  side: "BUY",
  signalCandle: candle("2026-01-01T10:00:00Z"),
  futureCandles: [candle("2026-01-01T11:00:00Z", {
    bidOpen: 97.7,
    askOpen: 97.9,
    bidHigh: 98.1,
    askHigh: 98.3,
    bidLow: 97.1,
    askLow: 97.3,
    bidClose: 97.8,
    askClose: 98,
    open: 97.9,
    high: 98.3,
    low: 97.3,
    close: 98,
  })],
  targetPct: 0.02,
  stopPct: 0.01,
  config,
});
assert.equal(longGap.exitReason, "gap");
assert.ok(longGap.grossProfitPercent < 0);
assert.equal(longGap.outcome, "loss");

console.log("execution model v3 tests passed");
