import { strict as assert } from "node:assert";
import { computeDatasetHash } from "../marketdata/dataset.js";
import { runRiskRegimeAnalysis } from "./analysis.js";
import type { BacktestRun, PortfolioPositionRow } from "../db/repository.js";
import type { Kline } from "../types.js";

const start = new Date("2026-01-01T00:00:00.000Z");
const klines: Kline[] = Array.from({ length: 60 }, (_, index) => {
  const openTime = new Date(start.getTime() + index * 60 * 60 * 1000);
  const closeTime = new Date(openTime.getTime() + 59 * 60 * 1000);
  const close = 100 + index * 0.25;
  return {
    openTime,
    closeTime,
    open: close - 0.1,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 10 + index,
  };
});

const run: BacktestRun = {
  id: 7,
  engine: "both",
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

const positions: PortfolioPositionRow[] = [];
const result = await runRiskRegimeAnalysis(
  run.id,
  undefined,
  {
    getBacktestRun: async () => run,
    getMarketDataRange: async () => klines,
    getPortfolioPositions: async () => positions,
  },
);

assert.equal(result.sourceRunId, 7);
assert.equal(result.asset, "BTCUSDT");
assert.equal(result.timeframe, "1h");
assert.equal(result.calibration.candles, 42);
assert.equal(result.evaluation.candles, 18);
assert.equal(Array.isArray(result.regimes), true);
assert.equal(result.regimes.length > 0, true);

console.log("risk analysis tests passed");
