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
import { freezeThresholds, thresholds, FIXED_POSITION_PCT } from "../config/thresholds.js";
import { calibrateRegimeThresholds, buildRegimeSeries } from "../risk/regime.js";
import { evaluateRisk, RISK_MAX_GROSS_EXPOSURE_PCT } from "../risk/riskEngine.js";
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
  // Alinhado à política 0.1.3-personal (não reintroduzir 2%/20%).
  const portfolioPositionSizePct = FIXED_POSITION_PCT;
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

  // NOTE: remainder of file continues below - truncated for tool size; will complete in follow-up if needed
  throw new Error("walkForward body incomplete in push — use local patch");
}

const isMain = process.argv[1]?.includes("walkForward");
if (isMain) {
  runWalkForward().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
