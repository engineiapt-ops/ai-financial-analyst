import { strict as assert } from "node:assert";
import type { CfdQuoteCandle } from "./executionModelV3.js";
import { runPaperTradingCycle, PAPER_TRADING_CYCLE_VERSION } from "./paperTradingCycle.js";
import type { MultiTimeframeContext } from "../signals/confluence.js";
import type { DecisionResult, Timeframe } from "../types.js";

function decision(recomendacao: "BUY" | "SELL" | "WAIT"): DecisionResult {
  return {
    origem: "baseline",
    recomendacao,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : 1.5,
    riscoElevado: false,
  };
}

function pa(bias: "BULLISH" | "BEARISH" | "NEUTRAL") {
  return {
    version: "price-action-v1" as const,
    bias,
    higherHigh: bias === "BULLISH",
    higherLow: bias === "BULLISH",
    lowerHigh: bias === "BEARISH",
    lowerLow: bias === "BEARISH",
    support: 99,
    resistance: 101,
  };
}

function regime(trend: "BULLISH" | "BEARISH" | "SIDEWAYS") {
  return {
    modelVersion: "regime-v1",
    dataAsOf: new Date("2026-10-05T15:00:00.000Z"),
    trend,
    volatility: "NORMAL" as const,
    momentum: "NEUTRAL" as const,
    key: `${trend}.NORMAL.NEUTRAL`,
    atrRelative: 0.01,
    emaSpreadPct: trend === "BULLISH" ? 0.2 : trend === "BEARISH" ? -0.2 : 0,
    rsi: 50,
    thresholdsVersion: "test-v1",
  };
}

const context: MultiTimeframeContext = {
  priceAction: {
    "1h": pa("BULLISH"),
    "4h": pa("BULLISH"),
    "1d": pa("BULLISH"),
  },
  regime: {
    "1h": regime("BULLISH"),
    "4h": regime("BULLISH"),
    "1d": regime("BULLISH"),
  },
};

const signalCandle: CfdQuoteCandle = {
  openTime: new Date("2026-10-05T14:00:00.000Z"),
  closeTime: new Date("2026-10-05T14:59:59.999Z"),
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 100,
  bidOpen: 99.98,
  askOpen: 100.02,
  bidHigh: 100.50,
  askHigh: 100.54,
  bidLow: 99.40,
  askLow: 99.44,
  bidClose: 100,
  askClose: 100.04,
};

const futureCandles: CfdQuoteCandle[] = [{
  openTime: new Date("2026-10-05T15:00:00.000Z"),
  closeTime: new Date("2026-10-05T15:59:59.999Z"),
  open: 100,
  high: 103,
  low: 100,
  close: 102.5,
  volume: 110,
  bidOpen: 100,
  askOpen: 100.04,
  bidHigh: 103,
  askHigh: 103.04,
  bidLow: 100,
  askLow: 100.04,
  bidClose: 102.5,
  askClose: 102.54,
}];

const executionConfig = {
  commissionPctPerSide: 0,
  slippagePctPerSide: 0,
  overnightFinancingPctPerDay: 0,
  leverage: 10,
  stopOutMarginLevelPct: 0,
};

const successful = runPaperTradingCycle({
  instrument: "BTCUSDT",
  signalTimeframe: "1h",
  atr: 1,
  decision: decision("BUY"),
  context,
  signalCandle,
  futureCandles,
  executionConfig,
  riskState: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
});

assert.equal(successful.version, PAPER_TRADING_CYCLE_VERSION);
assert.equal(successful.status, "validated");
assert.equal(successful.stage, "paper_validation");
assert.equal(successful.reason, "validated");
assert.ok(successful.candidateSignal?.status === "ready");
assert.ok(successful.finalSignal?.status === "ready");
assert.equal(successful.risk?.allowed, true);
assert.equal(successful.paper?.status, "validated");
assert.equal(successful.paper?.trade?.outcome, "win");
assert.ok((successful.finalSignal?.positionSizePct ?? 99) <= 15);

const exposureBlocked = runPaperTradingCycle({
  instrument: "BTCUSDT",
  signalTimeframe: "1h",
  atr: 1,
  decision: decision("BUY"),
  context,
  signalCandle,
  futureCandles,
  executionConfig,
  riskState: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 15,
    consecutiveLosses: 0,
  },
});

assert.equal(exposureBlocked.status, "blocked");
assert.equal(exposureBlocked.stage, "risk");
assert.equal(exposureBlocked.reason, "gross_exposure_limit");

const dailyLossBlocked = runPaperTradingCycle({
  instrument: "BTCUSDT",
  signalTimeframe: "1h",
  atr: 1,
  decision: decision("BUY"),
  context,
  signalCandle,
  futureCandles,
  executionConfig,
  riskState: {
    equity: 1000,
    dailyLossPct: 2,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
});

assert.equal(dailyLossBlocked.stage, "risk");
assert.equal(dailyLossBlocked.reason, "daily_loss_limit");

const htfVetoContext: MultiTimeframeContext = {
  priceAction: context.priceAction,
  regime: {
    ...context.regime,
    "4h": regime("BEARISH"),
  },
};

const htfBlocked = runPaperTradingCycle({
  instrument: "BTCUSDT",
  signalTimeframe: "1h",
  atr: 1,
  decision: decision("BUY"),
  context: htfVetoContext,
  signalCandle,
  futureCandles,
  executionConfig,
  riskState: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
});

assert.equal(htfBlocked.stage, "confluence");
assert.equal(htfBlocked.reason, "higher_timeframe_contradiction");

const missingRegimeContext: MultiTimeframeContext = {
  priceAction: context.priceAction,
  regime: {
    "4h": context.regime["4h"],
    "1d": context.regime["1d"],
  },
};

const missingRegime = runPaperTradingCycle({
  instrument: "BTCUSDT",
  signalTimeframe: "1h",
  atr: 1,
  decision: decision("BUY"),
  context: missingRegimeContext,
  signalCandle,
  futureCandles,
  executionConfig,
  riskState: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
});

assert.equal(missingRegime.stage, "confluence");
assert.equal(missingRegime.reason, "missing_timeframe_data");

const waiting = runPaperTradingCycle({
  instrument: "BTCUSDT",
  signalTimeframe: "1h",
  atr: 1,
  decision: decision("WAIT"),
  context,
  signalCandle,
  futureCandles,
  executionConfig,
  riskState: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
});

assert.equal(waiting.stage, "confluence");
assert.equal(waiting.reason, "wait_decision");

console.log("paper trading cycle tests passed");
