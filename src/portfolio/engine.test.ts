import { strict as assert } from "node:assert";
import type { BacktestRun, PortfolioEquityPointInput, PortfolioPositionInput, PortfolioRunSummary, PortfolioSourceTrade } from "../db/repository.js";
import type { Kline } from "../types.js";
import { runPortfolioEngine } from "./engine.js";

function makeCandles(): Kline[] {
  const start = Date.parse("2026-02-01T00:00:00.000Z");
  return Array.from({ length: 6 }, (_, index) => {
    const openTime = new Date(start + index * 60 * 60 * 1000);
    return {
      openTime,
      closeTime: new Date(openTime.getTime() + 60 * 60 * 1000 - 1),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
    };
  });
}

function makeRun(klines: Kline[]): BacktestRun {
  return {
    id: 21,
    engine: "baseline",
    mode: "oos",
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: klines[0].openTime,
    periodoFim: klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime,
    oosStartRatio: 0.7,
    calibrationEnd: null,
    validationStart: null,
    evaluationPolicyVersion: null,
    thresholdsCongeladosEm: null,
    candlesTotal: klines.length,
    datasetHash: "synthetic-portfolio-hash",
    executionModelVersion: "v2",
    targetPct: null,
    stopPct: null,
    lookaheadCandles: null,
    slippagePct: 0.05,
    feePct: 0.1,
    criadoEm: new Date(),
  };
}

function makeTrade(
  klines: Kline[],
  paperTradeId: number,
  side: "BUY" | "SELL",
  openedIndex: number,
  closedIndex: number,
  profitPercent: number,
  grossProfitPercent: number,
  feePercent: number,
): PortfolioSourceTrade {
  return {
    paperTradeId,
    side,
    entryPrice: 100,
    exitPrice: 100,
    outcome: profitPercent >= 0 ? "win" : "loss",
    profitPercent,
    grossProfitPercent,
    feePercent,
    slippagePercent: 0.1,
    openedAt: klines[openedIndex].closeTime ?? klines[openedIndex].openTime,
    closedAt: klines[closedIndex].closeTime ?? klines[closedIndex].openTime,
  };
}

const klines = makeCandles();
const sourceRun = makeRun(klines);
const firstTrade = makeTrade(klines, 1, "BUY", 1, 3, 10, 12, 2);
const duplicateFirstTrade = { ...firstTrade };
const secondTrade = makeTrade(klines, 2, "SELL", 4, 5, -5, -4, 1);

let createdPortfolioRunId = 0;
let savedPositions: PortfolioPositionInput[] = [];
let savedEquity: PortfolioEquityPointInput[] = [];
let finalizedSummary: PortfolioRunSummary | undefined;

const result = await runPortfolioEngine(
  {
    sourceRunId: 21,
    initialCapital: 1000,
    positionSizePct: 1.5,
    maxGrossExposurePct: 20,
  },
  {
    getBacktestRun: async () => sourceRun,
    getMarketDataRange: async () => klines,
    getPortfolioSourceTrades: async () => [firstTrade, duplicateFirstTrade, secondTrade],
    assertDatasetMatchesMetadata: () => "synthetic-hash",
    createPortfolioRun: async () => {
      createdPortfolioRunId = 501;
      return createdPortfolioRunId;
    },
    savePortfolioPositions: async (inputs) => {
      savedPositions = inputs;
      return inputs.length;
    },
    savePortfolioEquityPoints: async (inputs) => {
      savedEquity = inputs;
      return inputs.length;
    },
    finalizePortfolioRun: async (_runId, summary) => {
      finalizedSummary = summary;
    },
  },
);

assert.equal(result.positionSizePct, 1.5);
assert.equal(result.maxGrossExposurePct, 15);
assert.equal(result.initialCapital, 1000);
assert.equal(result.portfolioRunId, 501);
assert.equal(createdPortfolioRunId, 501);
assert.equal(result.totalTrades, 3);
assert.equal(result.closedTrades, 2);
assert.equal(savedPositions.length, 2);
assert.equal(new Set(savedPositions.map((position) => position.paperTradeId)).size, 2);
assert.equal(savedPositions.every((position) => position.allocatedNotional > 0), true);
assert.equal(savedPositions[0].allocatedNotional, 15);
assert.equal(savedPositions[0].netPnl, 1.5);
assert.equal(savedPositions[0].status, "closed");
assert.equal(savedPositions[0].closedAt?.getTime(), firstTrade.closedAt?.getTime());
assert.equal(savedPositions[1].side, "SELL");
assert.equal(savedPositions[1].status, "closed");
assert.equal(result.totalRealizedPnl, savedPositions.reduce((sum, position) => sum + (position.netPnl ?? 0), 0));
assert.equal(finalizedSummary?.closedTrades, 2);
assert.equal(Math.max(...savedEquity.map((point) => point.openPositions)), 1);

const waitPoint = savedEquity.find(
  (point) => point.asOf.getTime() === (klines[2].closeTime ?? klines[2].openTime).getTime(),
);
assert(waitPoint, "the WAIT candle must not create a position");
assert.equal(waitPoint.openPositions, 1);

await assert.rejects(
  () => runPortfolioEngine(
    { sourceRunId: 1, initialCapital: 0 },
    { getBacktestRun: async () => null },
  ),
  /initialCapital must be greater than zero/,
);

await assert.rejects(
  () => runPortfolioEngine({ sourceRunId: 1, positionSizePct: 101 }),
  /positionSizePct must be between 0 and 100/,
);

await assert.rejects(
  () => runPortfolioEngine({ sourceRunId: 1, positionSizePct: 3, maxGrossExposurePct: 2 }),
  /positionSizePct cannot exceed maxGrossExposurePct/,
);

console.log("portfolio engine tests passed");
