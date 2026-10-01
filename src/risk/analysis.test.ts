import { strict as assert } from "node:assert";
import type { BacktestRun, PortfolioPositionRow } from "../db/repository.js";
import type { Kline } from "../types.js";
import { runRiskRegimeAnalysis } from "./analysis.js";

function makeCandles(count: number): Kline[] {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const range = index < 40 ? 1 : index < 60 ? 0.5 : 20;
    const openTime = new Date(start + index * 60 * 60 * 1000);
    const closeTime = new Date(openTime.getTime() + 60 * 60 * 1000 - 1);
    return {
      openTime,
      closeTime,
      open: 100,
      high: 100 + range,
      low: 100 - range,
      close: 100,
      volume: 1000,
    };
  });
}

function makeRun(klines: Kline[], oosStartRatio = 0.5): BacktestRun {
  return {
    id: 7,
    engine: "both",
    mode: "oos",
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: klines[0].openTime,
    periodoFim: klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime,
    oosStartRatio,
    calibrationEnd: null,
    validationStart: null,
    evaluationPolicyVersion: null,
    thresholdsCongeladosEm: null,
    candlesTotal: klines.length,
    datasetHash: "synthetic-hash",
    executionModelVersion: null,
    targetPct: null,
    stopPct: null,
    lookaheadCandles: null,
    slippagePct: null,
    feePct: null,
    criadoEm: new Date(),
  };
}

function makePosition(
  klines: Kline[],
  paperTradeId: number,
  index: number,
  side: "BUY" | "SELL",
  netPnl: number,
): PortfolioPositionRow {
  const openedAt = klines[index].closeTime ?? klines[index].openTime;
  return {
    id: paperTradeId,
    portfolioRunId: 99,
    paperTradeId,
    side,
    allocatedNotional: 15,
    entryPrice: 100,
    exitPrice: 100,
    openedAt,
    closedAt: openedAt,
    status: "closed",
    netPnl,
    grossPnl: netPnl,
    fees: 0,
    slippage: 0,
    returnPct: netPnl / 15 * 100,
    rejectionReason: null,
  };
}

const klines = makeCandles(80);
const sourceRun = makeRun(klines);
const lowRiskPosition = makePosition(klines, 11, 42, "BUY", 1);
const highRiskPosition = makePosition(klines, 12, 72, "SELL", -1);

const result = await runRiskRegimeAnalysis(7, 99, {
  getBacktestRun: async () => sourceRun,
  getMarketDataRange: async () => klines,
  getPortfolioPositions: async () => [lowRiskPosition, highRiskPosition],
  assertDatasetMatchesMetadata: () => "synthetic-hash",
});

assert.equal(result.asset, "BTCUSDT");
assert.equal(result.timeframe, "1h");
assert.equal(result.calibration.candles, 40);
assert.equal(result.evaluation.candles, 40);
assert.equal(result.evaluation.highVolatilityCandles > 0, true);

const lowMetric = result.regimes.find((metric) => metric.volatility === "LOW");
const highMetric = result.regimes.find((metric) => metric.volatility === "HIGH");

assert(lowMetric, "a low-volatility regime must be present");
assert(highMetric, "a high-volatility regime must be present");
assert.equal(lowMetric.executedPositions, 1);
assert.equal(lowMetric.highVolatilityBlocksWouldOccur, 0);
assert.equal(highMetric.rejectedPositions, 0);
assert.equal(highMetric.highVolatilityBlocksWouldOccur, 1);

const insufficientCandles = makeCandles(20);
const insufficientRun = makeRun(insufficientCandles);

await assert.rejects(
  () => runRiskRegimeAnalysis(8, undefined, {
    getBacktestRun: async () => insufficientRun,
    getMarketDataRange: async () => insufficientCandles,
    assertDatasetMatchesMetadata: () => "synthetic-portfolio-hash",
  }),
  /Invalid calibration window for regime analysis/,
);

console.log("risk analysis tests passed");
