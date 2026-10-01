import { strict as assert } from "node:assert";
import { computeDatasetHash } from "../marketdata/dataset.js";
import { runPortfolioEngine } from "./engine.js";
import type { BacktestRun, PortfolioSourceTrade } from "../db/repository.js";
import type { Kline } from "../types.js";

const start = new Date("2026-01-01T00:00:00.000Z");
const klines: Kline[] = Array.from({ length: 30 }, (_, index) => {
  const openTime = new Date(start.getTime() + index * 60 * 60 * 1000);
  const closeTime = new Date(openTime.getTime() + 59 * 60 * 1000);
  const close = 100 + index;
  return {
    openTime,
    closeTime,
    open: close - 0.1,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 10,
  };
});

const run: BacktestRun = {
  id: 11,
  engine: "baseline",
  mode: "oos",
  ativo: "BTCUSDT",
  timeframe: "1h",
  periodoInicio: klines[0].openTime,
  periodoFim: klines[klines.length - 1].closeTime!,
  oosStartRatio: 0.7,
  calibrationEnd: null,
  validationStart: null,
  evaluationPolicyVersion: null,
  thresholdsCongeladosEm: null,
  candlesTotal: klines.length,
  datasetHash: computeDatasetHash(klines),
  executionModelVersion: null,
  targetPct: null,
  stopPct: null,
  lookaheadCandles: null,
  slippagePct: null,
  feePct: null,
  criadoEm: start,
};

const sourceTrades: PortfolioSourceTrade[] = [];
let finalized = false;
let savedPositions = false;
let savedEquity = false;

const result = await runPortfolioEngine(
  { sourceRunId: 11, initialCapital: 1000, positionSizePct: 2, maxGrossExposurePct: 20, riskGate: false },
  {
    createPortfolioRun: async () => 501,
    finalizePortfolioRun: async () => { finalized = true; },
    getBacktestRun: async () => run,
    getMarketDataRange: async () => klines,
    getPortfolioSourceTrades: async () => sourceTrades,
    savePortfolioPositions: async () => { savedPositions = true; },
    savePortfolioEquityPoints: async () => { savedEquity = true; },
  },
);

assert.equal(result.portfolioRunId, 501);
assert.equal(result.initialCapital, 1000);
assert.equal(result.finalEquity, 1000);
assert.equal(result.totalTrades, 0);
assert.equal(result.closedTrades, 0);
assert.equal(savedPositions, true);
assert.equal(savedEquity, true);
assert.equal(finalized, true);

console.log("portfolio engine tests passed");
