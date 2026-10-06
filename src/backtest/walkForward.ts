import { computeIndicatorsSeries } from "../features/indicators.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import {
  createWalkForwardRun,
  getMarketData,
  saveWalkForwardFold,
  getWalkForwardFolds,
  createWalkForwardPortfolioRun,
  saveWalkForwardPortfolioFold,
  saveWalkForwardPortfolioEquityPoints,
  getWalkForwardPortfolioRuns,
  getWalkForwardPortfolioFolds,
} from "../db/repository.js";
import {
  DEFAULT_EXECUTION_COSTS,
  EXECUTION_MODEL_VERSION,
  simulateTrade,
  type TradeOutcome,
} from "../papertrading/simulator.js";
import { computeDatasetHash } from "../marketdata/dataset.js";
import { assertKlinesAvailableAsOf } from "../marketdata/pointInTime.js";
import { freezeThresholds, thresholds } from "../config/thresholds.js";
import { calibrateRegimeThresholds, buildRegimeSeries } from "../risk/regime.js";
import { evaluateRiskV2, RISK_MAX_GROSS_EXPOSURE_PCT, RISK_POSITION_SIZE_PCT } from "../risk/riskEngine.js";
import {
  simulateWalkForwardPortfolio,
  WALK_FORWARD_PORTFOLIO_MODEL_VERSION,
  WALK_FORWARD_PORTFOLIO_RISK_MODEL_VERSION,
  type WalkForwardPortfolioTrade,
} from "../portfolio/walkForwardEngine.js";
import type { Kline, MarketState } from "../types.js";

const TARGET_PCT = 0.01;
const STOP_PCT = 0.005;
const LOOKAHEAD_CANDLES = 20;
const DEFAULT_INITIAL_TRAIN = 2000;
const DEFAULT_TEST_CANDLES = 500;
const DEFAULT_STEP_CANDLES = 500;
const CONCURRENCY = 2;

interface EvaluatedTrade {
  trade: TradeOutcome;
  exitIndex: number;
}

interface StrategySummary {
  status: "ok" | "unavailable" | "error";
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  totalProfitPercent: number;
  avgProfitPercent: number;
  expectancyPercent: number;
  maxDrawdownPercent: number;
  grossTotalProfitPercent: number;
  totalFeePercent: number;
  totalSlippagePercent: number;
  avgCandlesHeld: number | null;
  notas?: string;
}

function summarize(entries: EvaluatedTrade[]): StrategySummary {
  const ordered = [...entries].sort((a, b) => a.exitIndex - b.exitIndex);
  const closed = ordered.filter((entry) => entry.trade.outcome !== "open");
  const wins = closed.filter((entry) => entry.trade.outcome === "win");
  const gains = closed.reduce((sum, entry) => sum + Math.max(0, entry.trade.profitPercent), 0);
  const losses = closed.reduce((sum, entry) => sum + Math.min(0, entry.trade.profitPercent), 0);
  const net = closed.reduce((sum, entry) => sum + entry.trade.profitPercent, 0);
  const gross = closed.reduce((sum, entry) => sum + entry.trade.grossProfitPercent, 0);

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const entry of closed) {
    cumulative += entry.trade.profitPercent;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return {
    status: "ok",
    totalTrades: entries.length,
    closedTrades: closed.length,
    openTrades: entries.length - closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    profitFactor: losses < 0 ? gains / Math.abs(losses) : null,
    totalProfitPercent: net,
    avgProfitPercent: closed.length ? net / closed.length : 0,
    expectancyPercent: closed.length ? net / closed.length : 0,
    maxDrawdownPercent: maxDrawdown,
    grossTotalProfitPercent: gross,
    totalFeePercent: closed.reduce((sum, entry) => sum + entry.trade.feePercent, 0),
    totalSlippagePercent: closed.reduce((sum, entry) => sum + entry.trade.slippagePercent, 0),
    avgCandlesHeld: closed.length
      ? closed.reduce((sum, entry) => sum + entry.trade.candlesHeld, 0) / closed.length
      : null,
  };
}

function buildMarket(klines: Kline[], indicatorsSeries: ReturnType<typeof computeIndicatorsSeries>, index: number): MarketState {
  const candle = klines[index];
  const asOf = candle.closeTime ?? candle.openTime;
  return {
    ativo: "BTCUSDT",
    timeframe: "1h",
    timestamp: asOf.getTime(),
    dataAsOf: asOf.getTime(),
    precoAtual: candle.close,
    indicators: indicatorsSeries[index],
    noticiaSentimento: 0,
  };
}

function simulateBuyHold(klines: Kline[], start: number, end: number): EvaluatedTrade {
  const first = klines[start];
  const last = klines[end];
  const signalPrice = first.close;
  const entryPrice = signalPrice * (1 + DEFAULT_EXECUTION_COSTS.slippagePct);
  const exitPrice = last.close * (1 - DEFAULT_EXECUTION_COSTS.slippagePct);
  const grossProfitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  const feePercent = DEFAULT_EXECUTION_COSTS.feePct * 2 * 100;
  const profitPercent = grossProfitPercent - feePercent;
  let maxDrawdownPercent = 0;
  let peak = 1;

  for (let i = start; i <= end; i += 1) {
    const equity = (klines[i].close / entryPrice) * (1 - DEFAULT_EXECUTION_COSTS.feePct);
    peak = Math.max(peak, equity);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - equity) * 100);
  }

  const trade: TradeOutcome = {
    signalPrice,
    entryPrice,
    exitPrice,
    outcome: profitPercent >= 0 ? "win" : "loss",
    profitPercent,
    grossProfitPercent,
    feePercent,
    slippagePercent: (DEFAULT_EXECUTION_COSTS.slippagePct * 2) * 100,
    candlesHeld: end - start,
    exitReason: "end",
    targetPrice: entryPrice,
    stopPrice: entryPrice,
    maxFavorableExcursionPct: 0,
    maxAdverseExcursionPct: -maxDrawdownPercent,
  };

  return { trade, exitIndex: end };
}

function getOptions() {
  const args = new Map<string, string>();
  for (let i = 0; i < process.argv.length - 1; i += 1) {
    if (process.argv[i].startsWith("--")) args.set(process.argv[i], process.argv[i + 1]);
  }
  return {
    ativo: (args.get("--symbol") ?? "BTCUSDT").toUpperCase(),
    timeframe: (args.get("--timeframe") ?? "1h") as "1h" | "4h" | "1d",
    candles: Number(args.get("--candles") ?? 5000),
    initialTrainCandles: Number(args.get("--initial-train") ?? DEFAULT_INITIAL_TRAIN),
    testCandles: Number(args.get("--test") ?? DEFAULT_TEST_CANDLES),
    stepCandles: Number(args.get("--step") ?? DEFAULT_STEP_CANDLES),
    includeJev: (args.get("--include-jev") ?? "false").toLowerCase() === "true",
  };
}

export async function runWalkForward(options = getOptions()) {
  const {
    ativo,
    timeframe,
    candles: requestedCandles,
    initialTrainCandles,
    testCandles,
    stepCandles,
    includeJev,
  } = options;

  if (!["1h", "4h", "1d"].includes(timeframe)) throw new Error("Unsupported timeframe");
  if (![requestedCandles, initialTrainCandles, testCandles, stepCandles].every(Number.isInteger)) {
    throw new Error("Walk-forward parameters must be integers");
  }
  if (initialTrainCandles <= 0 || testCandles <= LOOKAHEAD_CANDLES || stepCandles <= 0) {
    throw new Error("Invalid walk-forward window parameters");
  }

  const klines = await getMarketData(ativo, timeframe, requestedCandles);
  if (klines.length < requestedCandles) {
    throw new Error(`Insufficient market_data: requested ${requestedCandles}, available ${klines.length}. Run the historical backfill first.`);
  }

  assertKlinesAvailableAsOf(
    klines,
    klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime,
  );
  freezeThresholds();

  const datasetHash = computeDatasetHash(klines);
  const walkForwardRunId = await createWalkForwardRun({
    ativo,
    timeframe,
    datasetStart: klines[0].openTime,
    datasetEnd: klines[klines.length - 1].openTime,
    candlesTotal: klines.length,
    datasetHash,
    initialTrainCandles,
    testCandles,
    stepCandles,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    executionModelVersion: EXECUTION_MODEL_VERSION,
    targetPct: TARGET_PCT,
    stopPct: STOP_PCT,
    slippagePct: DEFAULT_EXECUTION_COSTS.slippagePct,
    feePct: DEFAULT_EXECUTION_COSTS.feePct,
    thresholdFrozenAt: thresholds.frozenAt,
  });

  const indicatorsSeries = computeIndicatorsSeries(klines);
  const results: Record<string, unknown>[] = [];
  let foldNumber = 0;

  const portfolioInitialCapital = 1000;
  const portfolioPositionSizePct = RISK_POSITION_SIZE_PCT;
  const portfolioMaxGrossExposurePct = RISK_MAX_GROSS_EXPOSURE_PCT;

  const baselinePortfolioRunId = await createWalkForwardPortfolioRun({
    walkForwardRunId,
    strategy: "baseline",
    initialCapital: portfolioInitialCapital,
    positionSizePct: portfolioPositionSizePct,
    maxGrossExposurePct: portfolioMaxGrossExposurePct,
    portfolioModelVersion: WALK_FORWARD_PORTFOLIO_MODEL_VERSION,
    finalEquity: portfolioInitialCapital,
    totalReturnPct: 0,
    maxDrawdownPct: 0,
    totalSignals: 0,
    executedTrades: 0,
    closedTrades: 0,
    rejectedTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalRealizedPnl: 0,
    totalFees: 0,
    totalSlippage: 0,
    maxOpenPositions: 0,
    maxGrossExposure: 0,
    riskGateBlocks: 0,
  });

  const baselineRiskPortfolioRunId = await createWalkForwardPortfolioRun({
    walkForwardRunId,
    strategy: "baseline_risk",
    initialCapital: portfolioInitialCapital,
    positionSizePct: portfolioPositionSizePct,
    maxGrossExposurePct: portfolioMaxGrossExposurePct,
    portfolioModelVersion: WALK_FORWARD_PORTFOLIO_RISK_MODEL_VERSION,
    finalEquity: portfolioInitialCapital,
    totalReturnPct: 0,
    maxDrawdownPct: 0,
    totalSignals: 0,
    executedTrades: 0,
    closedTrades: 0,
    rejectedTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalRealizedPnl: 0,
    totalFees: 0,
    totalSlippage: 0,
    maxOpenPositions: 0,
    maxGrossExposure: 0,
    riskGateBlocks: 0,
  });

  let baselinePortfolioCapital = portfolioInitialCapital;
  let baselineRiskPortfolioCapital = portfolioInitialCapital;

  const baselinePortfolioPoints: Array<ReturnType<typeof simulateWalkForwardPortfolio>["equityCurve"][number]> = [];
  const baselineRiskPortfolioPoints: Array<ReturnType<typeof simulateWalkForwardPortfolio>["equityCurve"][number]> = [];

  let baselinePortfolioTotalSignals = 0;
  let baselinePortfolioExecutedTrades = 0;
  let baselinePortfolioClosedTrades = 0;
  let baselinePortfolioRejectedTrades = 0;
  let baselinePortfolioWinningTrades = 0;
  let baselinePortfolioLosingTrades = 0;
  let baselinePortfolioRealizedPnl = 0;
  let baselinePortfolioFees = 0;
  let baselinePortfolioSlippage = 0;
  let baselinePortfolioMaxOpenPositions = 0;
  let baselinePortfolioMaxGrossExposure = 0;

  let baselineRiskPortfolioTotalSignals = 0;
  let baselineRiskPortfolioExecutedTrades = 0;
  let baselineRiskPortfolioClosedTrades = 0;
  let baselineRiskPortfolioRejectedTrades = 0;
  let baselineRiskPortfolioWinningTrades = 0;
  let baselineRiskPortfolioLosingTrades = 0;
  let baselineRiskPortfolioRealizedPnl = 0;
  let baselineRiskPortfolioFees = 0;
  let baselineRiskPortfolioSlippage = 0;
  let baselineRiskPortfolioMaxOpenPositions = 0;
  let baselineRiskPortfolioMaxGrossExposure = 0;
  let baselineRiskPortfolioRiskBlocks = 0;

  for (let testStart = initialTrainCandles; testStart + testCandles <= klines.length; testStart += stepCandles) {
    foldNumber += 1;
    const testEnd = testStart + testCandles - 1;
    const lastSignalIndex = testEnd - LOOKAHEAD_CANDLES;
    const trainStart = 0;
    const trainEnd = testStart - 1;
    if (lastSignalIndex < testStart) break;

    const candidates: Array<{ index: number; future: Kline[]; market: MarketState }> = [];
    for (let index = testStart; index <= lastSignalIndex; index += 1) {
      const indicators = indicatorsSeries[index];
      if (
        indicators.ema9 === null ||
        indicators.ema21 === null ||
        indicators.rsi === null ||
        indicators.atr === null ||
        indicators.vwap === null
      ) continue;
      candidates.push({
        index,
        future: klines.slice(index + 1, index + 1 + LOOKAHEAD_CANDLES),
        market: buildMarket(klines, indicatorsSeries, index),
      });
    }

    const baselineTrades: EvaluatedTrade[] = [];
    const baselineRiskTrades: EvaluatedTrade[] = [];
    const baselinePortfolioTrades: WalkForwardPortfolioTrade[] = [];
    const baselineRiskPortfolioTrades: WalkForwardPortfolioTrade[] = [];
    let riskGateBlocks = 0;

    // Calibrate regime thresholds strictly on the fold's training window.
    const trainKlines = klines.slice(trainStart, testStart);
    const foldThresholds = calibrateRegimeThresholds(
      trainKlines,
      trainKlines.length,
      klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
    );
    const regimeSeries = buildRegimeSeries(klines, foldThresholds);
    const evaluationRegimes = regimeSeries.slice(testStart, testEnd + 1);
    const highVolatilityCandles = evaluationRegimes.filter((regime) => regime.volatility === "HIGH").length;

    for (const candidate of candidates) {
      const decision = evaluateBaseline(candidate.market);
      if (decision.recomendacao === "WAIT") continue;

      const trade = simulateTrade(
        decision.recomendacao,
        klines[candidate.index],
        candidate.future,
        TARGET_PCT,
        STOP_PCT,
      );
      baselineTrades.push({ trade, exitIndex: candidate.index + trade.candlesHeld });
      baselinePortfolioTrades.push({
        id: candidate.index,
        signalIndex: candidate.index - testStart,
        exitIndex: Math.min(candidate.index + trade.candlesHeld - testStart, testEnd - testStart),
        side: decision.recomendacao,
        outcome: trade,
      });

      const regime = regimeSeries[candidate.index];
      const risk = evaluateRiskV2({
        decision,
        regime,
        state: {
          equity: baselineRiskPortfolioCapital,
          dailyLossPct: 0,
          tradesToday: 0,
          openPositions: 0,
          grossExposurePct: 0,
          consecutiveLosses: 0,
        },
        stopDistancePct: STOP_PCT * 100,
      });
      if (!risk.allowed) {
        riskGateBlocks += 1;
        continue;
      }

      const riskTrade = simulateTrade(
        decision.recomendacao,
        klines[candidate.index],
        candidate.future,
        TARGET_PCT,
        STOP_PCT,
      );
      baselineRiskTrades.push({
        trade: riskTrade,
        exitIndex: candidate.index + riskTrade.candlesHeld,
      });
      baselineRiskPortfolioTrades.push({
        id: candidate.index,
        signalIndex: candidate.index - testStart,
        exitIndex: Math.min(candidate.index + riskTrade.candlesHeld - testStart, testEnd - testStart),
        side: decision.recomendacao,
        outcome: riskTrade,
      });
    }

    const baseline = summarize(baselineTrades);
    const baselineRisk = summarize(baselineRiskTrades);
    await saveWalkForwardFold({
      walkForwardRunId,
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      estrategia: "baseline",
      status: "ok",
      testSignals: candidates.length,
      totalTrades: baseline.totalTrades,
      closedTrades: baseline.closedTrades,
      openTrades: baseline.openTrades,
      winRate: baseline.winRate,
      profitFactor: baseline.profitFactor,
      totalProfitPercent: baseline.totalProfitPercent,
      avgProfitPercent: baseline.avgProfitPercent,
      expectancyPercent: baseline.expectancyPercent,
      maxDrawdownPercent: baseline.maxDrawdownPercent,
      grossTotalProfitPercent: baseline.grossTotalProfitPercent,
      totalFeePercent: baseline.totalFeePercent,
      totalSlippagePercent: baseline.totalSlippagePercent,
      avgCandlesHeld: baseline.avgCandlesHeld,
    });

    await saveWalkForwardFold({
      walkForwardRunId,
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      estrategia: "baseline_risk",
      status: "ok",
      testSignals: candidates.length,
      totalTrades: baselineRisk.totalTrades,
      closedTrades: baselineRisk.closedTrades,
      openTrades: baselineRisk.openTrades,
      winRate: baselineRisk.winRate,
      profitFactor: baselineRisk.profitFactor,
      totalProfitPercent: baselineRisk.totalProfitPercent,
      avgProfitPercent: baselineRisk.avgProfitPercent,
      expectancyPercent: baselineRisk.expectancyPercent,
      maxDrawdownPercent: baselineRisk.maxDrawdownPercent,
      grossTotalProfitPercent: baselineRisk.grossTotalProfitPercent,
      totalFeePercent: baselineRisk.totalFeePercent,
      totalSlippagePercent: baselineRisk.totalSlippagePercent,
      avgCandlesHeld: baselineRisk.avgCandlesHeld,
      notas: `riskGateBlocks=${riskGateBlocks}; calibrationCandles=${trainKlines.length}; lowVolAtr=${foldThresholds.lowVolAtrRelative}; highVolAtr=${foldThresholds.highVolAtrRelative}; model=regime-v1+risk-engine-v2`,
    });

    const foldKlines = klines.slice(testStart, testEnd + 1);

    const baselinePortfolio = simulateWalkForwardPortfolio({
      klines: foldKlines,
      trades: baselinePortfolioTrades,
      totalSignals: baselineTrades.length,
      initialCapital: baselinePortfolioCapital,
      positionSizePct: portfolioPositionSizePct,
      maxGrossExposurePct: portfolioMaxGrossExposurePct,
    });

    const baselineRiskPortfolio = simulateWalkForwardPortfolio({
      klines: foldKlines,
      trades: baselineRiskPortfolioTrades,
      totalSignals: baselineTrades.length,
      initialCapital: baselineRiskPortfolioCapital,
      positionSizePct: portfolioPositionSizePct,
      maxGrossExposurePct: portfolioMaxGrossExposurePct,
    });

    await saveWalkForwardPortfolioFold({
      walkForwardPortfolioRunId: baselinePortfolioRunId,
      walkForwardRunId,
      foldNumber,
      initialCapital: baselinePortfolioCapital,
      finalEquity: baselinePortfolio.finalEquity,
      totalReturnPct: baselinePortfolio.totalReturnPct,
      maxDrawdownPct: baselinePortfolio.maxDrawdownPct,
      sharpe: baselinePortfolio.sharpe,
      sortino: baselinePortfolio.sortino,
      totalSignals: baselinePortfolio.totalSignals,
      executedTrades: baselinePortfolio.executedTrades,
      closedTrades: baselinePortfolio.closedTrades,
      rejectedTrades: baselinePortfolio.rejectedTrades,
      winningTrades: baselinePortfolio.winningTrades,
      losingTrades: baselinePortfolio.losingTrades,
      totalRealizedPnl: baselinePortfolio.totalRealizedPnl,
      totalFees: baselinePortfolio.totalFees,
      totalSlippage: baselinePortfolio.totalSlippage,
      maxOpenPositions: baselinePortfolio.maxOpenPositions,
      maxGrossExposure: baselinePortfolio.maxGrossExposure,
      riskGateBlocks: 0,
    });

    await saveWalkForwardPortfolioFold({
      walkForwardPortfolioRunId: baselineRiskPortfolioRunId,
      walkForwardRunId,
      foldNumber,
      initialCapital: baselineRiskPortfolioCapital,
      finalEquity: baselineRiskPortfolio.finalEquity,
      totalReturnPct: baselineRiskPortfolio.totalReturnPct,
      maxDrawdownPct: baselineRiskPortfolio.maxDrawdownPct,
      sharpe: baselineRiskPortfolio.sharpe,
      sortino: baselineRiskPortfolio.sortino,
      totalSignals: baselineRiskPortfolio.totalSignals,
      executedTrades: baselineRiskPortfolio.executedTrades,
      closedTrades: baselineRiskPortfolio.closedTrades,
      rejectedTrades: baselineRiskPortfolio.rejectedTrades + riskGateBlocks,
      winningTrades: baselineRiskPortfolio.winningTrades,
      losingTrades: baselineRiskPortfolio.losingTrades,
      totalRealizedPnl: baselineRiskPortfolio.totalRealizedPnl,
      totalFees: baselineRiskPortfolio.totalFees,
      totalSlippage: baselineRiskPortfolio.totalSlippage,
      maxOpenPositions: baselineRiskPortfolio.maxOpenPositions,
      maxGrossExposure: baselineRiskPortfolio.maxGrossExposure,
      riskGateBlocks,
    });

    await saveWalkForwardPortfolioEquityPoints(
      baselinePortfolio.equityCurve.map((point) => ({
        walkForwardPortfolioRunId: baselinePortfolioRunId,
        foldNumber,
        asOf: point.asOf,
        equity: point.equity,
        cash: point.cash,
        realizedPnl: point.realizedPnl,
        unrealizedPnl: point.unrealizedPnl,
        grossExposure: point.grossExposure,
        openPositions: point.openPositions,
        drawdownPct: point.drawdownPct,
      })),
    );

    await saveWalkForwardPortfolioEquityPoints(
      baselineRiskPortfolio.equityCurve.map((point) => ({
        walkForwardPortfolioRunId: baselineRiskPortfolioRunId,
        foldNumber,
        asOf: point.asOf,
        equity: point.equity,
        cash: point.cash,
        realizedPnl: point.realizedPnl,
        unrealizedPnl: point.unrealizedPnl,
        grossExposure: point.grossExposure,
        openPositions: point.openPositions,
        drawdownPct: point.drawdownPct,
      })),
    );

    baselinePortfolioCapital = baselinePortfolio.finalEquity;
    baselineRiskPortfolioCapital = baselineRiskPortfolio.finalEquity;

    baselinePortfolioPoints.push(...baselinePortfolio.equityCurve);
    baselineRiskPortfolioPoints.push(...baselineRiskPortfolio.equityCurve);

    baselinePortfolioTotalSignals += baselinePortfolio.totalSignals;
    baselinePortfolioExecutedTrades += baselinePortfolio.executedTrades;
    baselinePortfolioClosedTrades += baselinePortfolio.closedTrades;
    baselinePortfolioRejectedTrades += baselinePortfolio.rejectedTrades;
    baselinePortfolioWinningTrades += baselinePortfolio.winningTrades;
    baselinePortfolioLosingTrades += baselinePortfolio.losingTrades;
    baselinePortfolioRealizedPnl += baselinePortfolio.totalRealizedPnl;
    baselinePortfolioFees += baselinePortfolio.totalFees;
    baselinePortfolioSlippage += baselinePortfolio.totalSlippage;
    baselinePortfolioMaxOpenPositions = Math.max(
      baselinePortfolioMaxOpenPositions,
      baselinePortfolio.maxOpenPositions,
    );
    baselinePortfolioMaxGrossExposure = Math.max(
      baselinePortfolioMaxGrossExposure,
      baselinePortfolio.maxGrossExposure,
    );

    baselineRiskPortfolioTotalSignals += baselineRiskPortfolio.totalSignals;
    baselineRiskPortfolioExecutedTrades += baselineRiskPortfolio.executedTrades;
    baselineRiskPortfolioClosedTrades += baselineRiskPortfolio.closedTrades;
    baselineRiskPortfolioRejectedTrades +=
      baselineRiskPortfolio.rejectedTrades + riskGateBlocks;
    baselineRiskPortfolioWinningTrades += baselineRiskPortfolio.winningTrades;
    baselineRiskPortfolioLosingTrades += baselineRiskPortfolio.losingTrades;
    baselineRiskPortfolioRealizedPnl += baselineRiskPortfolio.totalRealizedPnl;
    baselineRiskPortfolioFees += baselineRiskPortfolio.totalFees;
    baselineRiskPortfolioSlippage += baselineRiskPortfolio.totalSlippage;
    baselineRiskPortfolioMaxOpenPositions = Math.max(
      baselineRiskPortfolioMaxOpenPositions,
      baselineRiskPortfolio.maxOpenPositions,
    );
    baselineRiskPortfolioMaxGrossExposure = Math.max(
      baselineRiskPortfolioMaxGrossExposure,
      baselineRiskPortfolio.maxGrossExposure,
    );
    baselineRiskPortfolioRiskBlocks += riskGateBlocks;

    const buyHold = simulateBuyHold(klines, testStart, testEnd);
    const buyHoldSummary = summarize([buyHold]);
    await saveWalkForwardFold({
      walkForwardRunId,
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      estrategia: "buyhold",
      status: "ok",
      testSignals: 1,
      totalTrades: 1,
      closedTrades: 1,
      openTrades: 0,
      winRate: buyHoldSummary.winRate,
      profitFactor: buyHoldSummary.profitFactor,
      totalProfitPercent: buyHoldSummary.totalProfitPercent,
      avgProfitPercent: buyHoldSummary.avgProfitPercent,
      expectancyPercent: buyHoldSummary.expectancyPercent,
      maxDrawdownPercent: buyHoldSummary.maxDrawdownPercent,
      grossTotalProfitPercent: buyHoldSummary.grossTotalProfitPercent,
      totalFeePercent: buyHoldSummary.totalFeePercent,
      totalSlippagePercent: buyHoldSummary.totalSlippagePercent,
      avgCandlesHeld: buyHoldSummary.avgCandlesHeld,
    });

    let jevResult: StrategySummary | null = null;
    let jevNote = "Jev disabled for this run.";
    if (includeJev) {
      try {
        const decisions: Array<Awaited<ReturnType<typeof decideWithJev>>> = [];
        let next = 0;
        const worker = async () => {
          while (next < candidates.length) {
            const idx = next;
            next += 1;
            decisions[idx] = await decideWithJev(candidates[idx].market, "oos");
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));

        const jevTrades: EvaluatedTrade[] = [];
        for (let index = 0; index < candidates.length; index += 1) {
          const decision = decisions[index];
          if (decision.recomendacao === "WAIT") continue;
          const trade = simulateTrade(
            decision.recomendacao,
            klines[candidates[index].index],
            candidates[index].future,
            TARGET_PCT,
            STOP_PCT,
          );
          jevTrades.push({ trade, exitIndex: candidates[index].index + trade.candlesHeld });
        }
        jevResult = summarize(jevTrades);
        jevNote = "Jev evaluated on the same walk-forward fold.";
      } catch (error) {
        jevNote = error instanceof Error ? error.message : String(error);
      }
    }

    if (jevResult) {
      await saveWalkForwardFold({
        walkForwardRunId,
        foldNumber,
        trainStart: klines[trainStart].openTime,
        trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
        testStart: klines[testStart].openTime,
        testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
        estrategia: "jev",
        status: "ok",
        testSignals: candidates.length,
        totalTrades: jevResult.totalTrades,
        closedTrades: jevResult.closedTrades,
        openTrades: jevResult.openTrades,
        winRate: jevResult.winRate,
        profitFactor: jevResult.profitFactor,
        totalProfitPercent: jevResult.totalProfitPercent,
        avgProfitPercent: jevResult.avgProfitPercent,
        expectancyPercent: jevResult.expectancyPercent,
        maxDrawdownPercent: jevResult.maxDrawdownPercent,
        grossTotalProfitPercent: jevResult.grossTotalProfitPercent,
        totalFeePercent: jevResult.totalFeePercent,
        totalSlippagePercent: jevResult.totalSlippagePercent,
        avgCandlesHeld: jevResult.avgCandlesHeld,
        notas: jevNote,
      });
    } else {
      await saveWalkForwardFold({
        walkForwardRunId,
        foldNumber,
        trainStart: klines[trainStart].openTime,
        trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
        testStart: klines[testStart].openTime,
        testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
        estrategia: "jev",
        status: "unavailable",
        testSignals: candidates.length,
        notas: jevNote,
      });
    }

    results.push({
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      baseline,
      baselineRisk,
      riskGateBlocks,
      highVolatilityCandles,
      portfolio: {
        baseline: baselinePortfolio,
        baselineRisk: baselineRiskPortfolio,
      },
      highVolatilityPct: (highVolatilityCandles / testCandles) * 100,
      buyhold: buyHoldSummary,
      jev: jevResult ?? { status: "unavailable", notas: jevNote },
    });
  }

  const combinedStats = (points: ReturnType<typeof simulateWalkForwardPortfolio>["equityCurve"], initialCapital: number) => {
    const returns: number[] = [];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1].equity;
      if (previous > 0) returns.push(points[index].equity / previous - 1);
    }
    let peakEquity = initialCapital;
    let maxDrawdownPct = 0;
    for (const point of points) {
      peakEquity = Math.max(peakEquity, point.equity);
      if (peakEquity > 0) {
        maxDrawdownPct = Math.max(
          maxDrawdownPct,
          ((peakEquity - point.equity) / peakEquity) * 100,
        );
      }
    }
    const finalEquity = points[points.length - 1]?.equity ?? initialCapital;
    const startAsOf = points[0]?.asOf ?? klines[initialTrainCandles].closeTime ?? klines[initialTrainCandles].openTime;
    const endAsOf = points[points.length - 1]?.asOf ?? klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime;
    return {
      finalEquity,
      totalReturnPct: ((finalEquity / initialCapital) - 1) * 100,
      maxDrawdownPct,
      sharpe: returns.length ? (
        (() => {
          const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
          const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
          const sigma = Math.sqrt(variance);
          return sigma === 0 ? null : (mean / sigma) * Math.sqrt(24 * 365);
        })()
      ) : null,
      sortino: returns.length ? (
        (() => {
          const downside = returns.filter((value) => value < 0);
          if (!downside.length) return null;
          const downsideDeviation = Math.sqrt(
            downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length,
          );
          const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
          return downsideDeviation === 0 ? null : (mean / downsideDeviation) * Math.sqrt(24 * 365);
        })()
      ) : null,
      cagrPct: finalEquity > 0
        ? (((finalEquity / initialCapital) ** (
            (24 * 365) / ((endAsOf.getTime() - startAsOf.getTime()) / (60 * 60 * 1000))
          )) - 1) * 100
        : null,
    };
  };

  const baselineAggregate = combinedStats(baselinePortfolioPoints, portfolioInitialCapital);
  const baselineRiskAggregate = combinedStats(
    baselineRiskPortfolioPoints,
    portfolioInitialCapital,
  );

  await createWalkForwardPortfolioRun({
    walkForwardRunId,
    strategy: "baseline",
    initialCapital: portfolioInitialCapital,
    positionSizePct: portfolioPositionSizePct,
    maxGrossExposurePct: portfolioMaxGrossExposurePct,
    portfolioModelVersion: WALK_FORWARD_PORTFOLIO_MODEL_VERSION,
    ...baselineAggregate,
    totalSignals: baselinePortfolioTotalSignals,
    executedTrades: baselinePortfolioExecutedTrades,
    closedTrades: baselinePortfolioClosedTrades,
    rejectedTrades: baselinePortfolioRejectedTrades,
    winningTrades: baselinePortfolioWinningTrades,
    losingTrades: baselinePortfolioLosingTrades,
    totalRealizedPnl: baselinePortfolioRealizedPnl,
    totalFees: baselinePortfolioFees,
    totalSlippage: baselinePortfolioSlippage,
    maxOpenPositions: baselinePortfolioMaxOpenPositions,
    maxGrossExposure: baselinePortfolioMaxGrossExposure,
    riskGateBlocks: 0,
  });

  await createWalkForwardPortfolioRun({
    walkForwardRunId,
    strategy: "baseline_risk",
    initialCapital: portfolioInitialCapital,
    positionSizePct: portfolioPositionSizePct,
    maxGrossExposurePct: portfolioMaxGrossExposurePct,
    portfolioModelVersion: WALK_FORWARD_PORTFOLIO_RISK_MODEL_VERSION,
    ...baselineRiskAggregate,
    totalSignals: baselineRiskPortfolioTotalSignals,
    executedTrades: baselineRiskPortfolioExecutedTrades,
    closedTrades: baselineRiskPortfolioClosedTrades,
    rejectedTrades: baselineRiskPortfolioRejectedTrades,
    winningTrades: baselineRiskPortfolioWinningTrades,
    losingTrades: baselineRiskPortfolioLosingTrades,
    totalRealizedPnl: baselineRiskPortfolioRealizedPnl,
    totalFees: baselineRiskPortfolioFees,
    totalSlippage: baselineRiskPortfolioSlippage,
    maxOpenPositions: baselineRiskPortfolioMaxOpenPositions,
    maxGrossExposure: baselineRiskPortfolioMaxGrossExposure,
    riskGateBlocks: baselineRiskPortfolioRiskBlocks,
  });

  return {
    walkForwardRunId,
    ativo,
    timeframe,
    candles: klines.length,
    datasetHash,
    initialTrainCandles,
    testCandles,
    stepCandles,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    foldCount: foldNumber,
    thresholdFrozenAt: thresholds.frozenAt,
    results: await getWalkForwardFolds(walkForwardRunId),
    portfolioRuns: await getWalkForwardPortfolioRuns(walkForwardRunId),
    portfolioFolds: {
      baseline: await getWalkForwardPortfolioFolds(baselinePortfolioRunId),
      baselineRisk: await getWalkForwardPortfolioFolds(baselineRiskPortfolioRunId),
    },
    note: "Fixed-rule walk-forward validation with frozen per-fold regime thresholds and realistic finite-capital portfolio simulation: no strategy parameter optimization is performed in this stage.",
  };
}


if (import.meta.url === new URL(process.argv[1], "file:").href) {
  runWalkForward().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
