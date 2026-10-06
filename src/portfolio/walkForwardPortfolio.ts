import {
  createWalkForwardPortfolioRun,
  getMarketDataRange,
  getWalkForwardFolds,
  getWalkForwardRun,
  saveWalkForwardPortfolioEquityPoints,
  saveWalkForwardPortfolioFold,
} from "../db/repository.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import { assertDatasetMatchesMetadata } from "../marketdata/dataset.js";
import { simulateTrade, FEE_PCT, SLIPPAGE_PCT, type TradeOutcome } from "../papertrading/simulator.js";
import { calibrateRegimeThresholds, classifyRegime, type RegimeSnapshot } from "../risk/regime.js";
import { evaluateRiskV2 } from "../risk/riskEngine.js";
import type { Kline, MarketState } from "../types.js";

export const WALK_FORWARD_PORTFOLIO_MODEL_VERSION = "walk-forward-portfolio-v1.1";
export const WALK_FORWARD_RISK_PORTFOLIO_MODEL_VERSION =
  "walk-forward-portfolio-v1.1+risk-regime-v1";

const DEFAULT_INITIAL_CAPITAL = 1000;
const DEFAULT_POSITION_SIZE_PCT = 2;
const DEFAULT_MAX_GROSS_EXPOSURE_PCT = 20;

interface CandidateTrade {
  signalIndex: number;
  side: "BUY" | "SELL";
  openedAt: Date;
  exitIndex: number;
  trade: TradeOutcome;
}

interface ActivePosition {
  candidate: CandidateTrade;
  notional: number;
  quantity: number;
  entryFee: number;
}

interface EquityPoint {
  foldNumber: number;
  asOf: Date;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
  grossExposure: number;
  openPositions: number;
  drawdownPct: number;
}

interface PreparedFold {
  foldNumber: number;
  testStartIndex: number;
  testEndIndex: number;
  candidates: CandidateTrade[];
  regimes: Map<number, RegimeSnapshot>;
}

interface PortfolioStats {
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpe: number | null;
  sortino: number | null;
  totalSignals: number;
  executedTrades: number;
  closedTrades: number;
  rejectedTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalRealizedPnl: number;
  totalFees: number;
  totalSlippage: number;
  maxOpenPositions: number;
  maxGrossExposure: number;
  riskGateBlocks: number;
  equityCurve: EquityPoint[];
  folds: Array<{
    foldNumber: number;
    initialCapital: number;
    finalEquity: number;
    totalReturnPct: number;
    maxDrawdownPct: number;
    sharpe: number | null;
    sortino: number | null;
    totalSignals: number;
    executedTrades: number;
    closedTrades: number;
    rejectedTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalRealizedPnl: number;
    totalFees: number;
    totalSlippage: number;
    maxOpenPositions: number;
    maxGrossExposure: number;
    riskGateBlocks: number;
    equityCurve: EquityPoint[];
  }>;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function annualizedSharpe(returns: number[]): number | null {
  const sigma = stddev(returns);
  if (!returns.length || sigma === 0) return null;
  return (mean(returns) / sigma) * Math.sqrt(24 * 365);
}

function annualizedSortino(returns: number[]): number | null {
  if (!returns.length) return null;
  const downside = returns.filter((value) => value < 0);
  if (!downside.length) return null;
  const downsideDeviation = Math.sqrt(mean(downside.map((value) => value ** 2)));
  if (downsideDeviation === 0) return null;
  return (mean(returns) / downsideDeviation) * Math.sqrt(24 * 365);
}

function cagr(initialCapital: number, finalEquity: number, start: Date, end: Date): number | null {
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  if (hours <= 0 || initialCapital <= 0 || finalEquity <= 0) return null;
  return ((finalEquity / initialCapital) ** ((24 * 365) / hours) - 1) * 100;
}

function marketState(
  klines: Kline[],
  indicatorsSeries: ReturnType<typeof computeIndicatorsSeries>,
  index: number,
  ativo: string,
  timeframe: "1h" | "4h" | "1d",
): MarketState {
  const candle = klines[index];
  const asOf = candle.closeTime ?? candle.openTime;
  return {
    ativo,
    timeframe,
    timestamp: asOf.getTime(),
    dataAsOf: asOf.getTime(),
    precoAtual: candle.close,
    indicators: indicatorsSeries[index],
    noticiaSentimento: 0,
  };
}

function markPosition(position: ActivePosition, rawPrice: number) {
  const side = position.candidate.side;
  const direction = side === "BUY" ? 1 : -1;
  const estimatedExitPrice = side === "BUY"
    ? rawPrice * (1 - SLIPPAGE_PCT)
    : rawPrice * (1 + SLIPPAGE_PCT);
  const grossPnl =
    (estimatedExitPrice - position.candidate.trade.entryPrice)
    * position.quantity
    * direction;
  const exitNotional = Math.abs(estimatedExitPrice * position.quantity);
  const exitFee = exitNotional * FEE_PCT;
  return {
    estimatedExitPrice,
    grossPnl,
    exitFee,
    netPnl: grossPnl - exitFee,
  };
}

function closeStoredTrade(position: ActivePosition) {
  const trade = position.candidate.trade;
  const grossPnl = position.notional * (trade.grossProfitPercent / 100);
  const totalFees = position.notional * (trade.feePercent / 100);
  const exitFee = Math.max(0, totalFees - position.entryFee);
  const netPnl = position.notional * (trade.profitPercent / 100);
  const slippage = position.notional * (trade.slippagePercent / 100);
  return { grossPnl, totalFees, exitFee, netPnl, slippage };
}

function closeAtEnd(position: ActivePosition, rawPrice: number) {
  const mark = markPosition(position, rawPrice);
  const totalFees = position.entryFee + mark.exitFee;
  const slippage =
    position.notional * SLIPPAGE_PCT +
    Math.abs(mark.estimatedExitPrice * position.quantity) * SLIPPAGE_PCT;
  return {
    grossPnl: mark.grossPnl,
    totalFees,
    exitFee: mark.exitFee,
    netPnl: mark.grossPnl - totalFees,
    slippage,
  };
}

function buildCandidates(
  klines: Kline[],
  indicatorsSeries: ReturnType<typeof computeIndicatorsSeries>,
  testStartIndex: number,
  testEndIndex: number,
  lookaheadCandles: number,
  targetPct: number,
  stopPct: number,
  ativo: string,
  timeframe: "1h" | "4h" | "1d",
): CandidateTrade[] {
  const candidates: CandidateTrade[] = [];
  const lastSignalIndex = testEndIndex - lookaheadCandles;

  for (let index = testStartIndex; index <= lastSignalIndex; index += 1) {
    const indicators = indicatorsSeries[index];
    if (
      indicators.ema9 === null ||
      indicators.ema21 === null ||
      indicators.rsi === null ||
      indicators.atr === null ||
      indicators.vwap === null
    ) continue;

    const market = marketState(klines, indicatorsSeries, index, ativo, timeframe);
    const decision = evaluateBaseline(market);
    if (decision.recomendacao === "WAIT") continue;

    const future = klines.slice(index + 1, index + 1 + lookaheadCandles);
    const trade = simulateTrade(
      decision.recomendacao,
      klines[index],
      future,
      targetPct,
      stopPct,
    );
    candidates.push({
      signalIndex: index,
      side: decision.recomendacao,
      openedAt: klines[index].closeTime ?? klines[index].openTime,
      exitIndex: index + trade.candlesHeld,
      trade,
    });
  }
  return candidates;
}

function simulatePortfolio(
  klines: Kline[],
  preparedFolds: PreparedFold[],
  initialCapital: number,
  positionSizePct: number,
  maxGrossExposurePct: number,
  riskGate: boolean,
): PortfolioStats {
  let capital = initialCapital;
  let totalSignals = 0;
  let executedTrades = 0;
  let closedTrades = 0;
  let rejectedTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let totalRealizedPnl = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  let maxOpenPositions = 0;
  let maxGrossExposure = 0;
  let riskGateBlocks = 0;
  let globalPeakEquity = initialCapital;

  const allEquity: EquityPoint[] = [];
  const foldSummaries: PortfolioStats["folds"] = [];

  for (const fold of preparedFolds) {
    const entriesByTime = new Map<number, CandidateTrade[]>();
    const exitsByTime = new Map<number, CandidateTrade[]>();

    for (const candidate of fold.candidates) {
      const entryTime = candidate.openedAt.getTime();
      const entries = entriesByTime.get(entryTime) ?? [];
      entries.push(candidate);
      entriesByTime.set(entryTime, entries);

      if (candidate.trade.outcome !== "open") {
        const exitCandle = klines[candidate.exitIndex];
        const exitTime = (exitCandle.closeTime ?? exitCandle.openTime).getTime();
        const exits = exitsByTime.get(exitTime) ?? [];
        exits.push(candidate);
        exitsByTime.set(exitTime, exits);
      }
    }

    const foldStartCapital = capital;
    let cash = capital;
    let realizedPnl = 0;
    let fees = 0;
    let slippage = 0;
    let rejects = 0;
    let riskBlocks = 0;
    let wins = 0;
    let losses = 0;
    let executed = 0;
    let closed = 0;
    let peakEquity = foldStartCapital;
    let foldMaxDrawdown = 0;
    let foldMaxOpen = 0;
    let foldMaxGross = 0;
    const active = new Map<number, ActivePosition>();
    const foldEquity: EquityPoint[] = [];

    for (let i = fold.testStartIndex; i <= fold.testEndIndex; i += 1) {
      const candle = klines[i];
      const asOf = candle.closeTime ?? candle.openTime;

      for (const candidate of exitsByTime.get(asOf.getTime()) ?? []) {
        const position = active.get(candidate.signalIndex);
        if (!position) continue;

        const result = closeStoredTrade(position);
        cash += position.notional + result.grossPnl - result.exitFee;
        realizedPnl += result.netPnl;
        fees += result.totalFees - position.entryFee;
        slippage += Math.max(
          0,
          position.notional * (position.candidate.trade.slippagePercent / 100) -
            position.notional * SLIPPAGE_PCT,
        );
        active.delete(candidate.signalIndex);
        closed += 1;
        if (result.netPnl > 0) wins += 1;
        if (result.netPnl < 0) losses += 1;
      }

      let grossExposure = 0;
      for (const position of active.values()) {
        grossExposure += position.notional;
      }

      let equity = cash + [...active.values()].reduce((sum, position) => {
        return sum + position.notional + markPosition(position, candle.close).netPnl;
      }, 0);

      for (const candidate of entriesByTime.get(asOf.getTime()) ?? []) {
        if (active.has(candidate.signalIndex)) continue;

        if (riskGate) {
          const regime = fold.regimes.get(candidate.signalIndex);
          if (!regime) {
            throw new Error(`Missing regime for signal index ${candidate.signalIndex}`);
          }
          const risk = evaluateRiskV2({
            decision: {
              origem: "baseline",
              recomendacao: candidate.side,
              tamanhoPosicaoPct: positionSizePct,
            },
            regime,
            state: {
              equity,
              dailyLossPct: 0,
              tradesToday: 0,
              openPositions: active.size,
              grossExposurePct: equity > 0 ? (grossExposure / equity) * 100 : 0,
              consecutiveLosses: 0,
            },
            stopDistancePct: 0.5,
          });
          if (!risk.allowed) {
            rejectedTrades += 1;
            rejects += 1;
            riskBlocks += 1;
            continue;
          }
        }

        const requestedNotional = equity * (positionSizePct / 100);
        const remainingExposure = Math.max(
          0,
          equity * (maxGrossExposurePct / 100) - grossExposure,
        );

        if (remainingExposure < requestedNotional) {
          rejectedTrades += 1;
          rejects += 1;
          continue;
        }

        const notional = requestedNotional;
        const entryFee = notional * FEE_PCT;
        cash -= notional + entryFee;
        const quantity = notional / candidate.trade.entryPrice;
        active.set(candidate.signalIndex, {
          candidate,
          notional,
          quantity,
          entryFee,
        });
        grossExposure += notional;
        executed += 1;
        fees += entryFee;
        slippage += notional * SLIPPAGE_PCT;

        equity = cash + [...active.values()].reduce((sum, position) => {
          return sum + position.notional + markPosition(position, candle.close).netPnl;
        }, 0);
      }

      grossExposure = 0;
      let unrealizedPnl = 0;
      for (const position of active.values()) {
        const mark = markPosition(position, candle.close);
        grossExposure += position.notional;
        unrealizedPnl += mark.netPnl;
      }

      equity = cash + [...active.values()].reduce((sum, position) => {
        return sum + position.notional + markPosition(position, candle.close).netPnl;
      }, 0);

      peakEquity = Math.max(peakEquity, equity);
      globalPeakEquity = Math.max(globalPeakEquity, equity);
      const foldDrawdownPct = peakEquity > 0
        ? ((peakEquity - equity) / peakEquity) * 100
        : 0;
      const drawdownPct = globalPeakEquity > 0
        ? ((globalPeakEquity - equity) / globalPeakEquity) * 100
        : 0;

      foldMaxDrawdown = Math.max(foldMaxDrawdown, foldDrawdownPct);
      foldMaxOpen = Math.max(foldMaxOpen, active.size);
      foldMaxGross = Math.max(foldMaxGross, grossExposure);
      maxOpenPositions = Math.max(maxOpenPositions, active.size);
      maxGrossExposure = Math.max(maxGrossExposure, grossExposure);

      const point = {
        foldNumber: fold.foldNumber,
        asOf,
        equity,
        cash,
        realizedPnl: totalRealizedPnl + realizedPnl,
        unrealizedPnl,
        grossExposure,
        openPositions: active.size,
        drawdownPct,
      };
      foldEquity.push(point);
      allEquity.push(point);
    }

    const finalCandle = klines[fold.testEndIndex];

    for (const position of [...active.values()]) {
      const result = closeAtEnd(position, finalCandle.close);
      cash += position.notional + result.grossPnl - result.exitFee;
      realizedPnl += result.netPnl;
      fees += result.totalFees - position.entryFee;
      slippage += result.slippage - position.notional * SLIPPAGE_PCT;
      closed += 1;
      if (result.netPnl > 0) wins += 1;
      if (result.netPnl < 0) losses += 1;
      active.delete(position.candidate.signalIndex);
    }

    const finalEquity = cash;
    const finalAsOf = new Date(
      (finalCandle.closeTime ?? finalCandle.openTime).getTime() + 1,
    );
    globalPeakEquity = Math.max(globalPeakEquity, finalEquity);
    const finalDrawdownPct = globalPeakEquity > 0
      ? ((globalPeakEquity - finalEquity) / globalPeakEquity) * 100
      : 0;

    foldMaxDrawdown = Math.max(
      foldMaxDrawdown,
      peakEquity > 0 ? ((peakEquity - finalEquity) / peakEquity) * 100 : 0,
    );

    const finalPoint = {
      foldNumber: fold.foldNumber,
      asOf: finalAsOf,
      equity: finalEquity,
      cash: finalEquity,
      realizedPnl: totalRealizedPnl + realizedPnl,
      unrealizedPnl: 0,
      grossExposure: 0,
      openPositions: 0,
      drawdownPct: finalDrawdownPct,
    };
    foldEquity.push(finalPoint);
    allEquity.push(finalPoint);

    const foldReturns: number[] = [];
    for (let index = 1; index < foldEquity.length; index += 1) {
      const previous = foldEquity[index - 1].equity;
      if (previous > 0) foldReturns.push(foldEquity[index].equity / previous - 1);
    }

    foldSummaries.push({
      foldNumber: fold.foldNumber,
      initialCapital: foldStartCapital,
      finalEquity,
      totalReturnPct: ((finalEquity / foldStartCapital) - 1) * 100,
      maxDrawdownPct: foldMaxDrawdown,
      sharpe: annualizedSharpe(foldReturns),
      sortino: annualizedSortino(foldReturns),
      totalSignals: fold.candidates.length,
      executedTrades: executed,
      closedTrades: closed,
      rejectedTrades: rejects,
      winningTrades: wins,
      losingTrades: losses,
      totalRealizedPnl: realizedPnl,
      totalFees: fees,
      totalSlippage: slippage,
      maxOpenPositions: foldMaxOpen,
      maxGrossExposure: foldMaxGross,
      riskGateBlocks: riskBlocks,
      equityCurve: foldEquity,
    });

    totalSignals += fold.candidates.length;
    capital = finalEquity;
    totalRealizedPnl += realizedPnl;
    totalFees += fees;
    totalSlippage += slippage;
    executedTrades += executed;
    closedTrades += closed;
    winningTrades += wins;
    losingTrades += losses;
    riskGateBlocks += riskBlocks;
  }

  const returns: number[] = [];
  for (let index = 1; index < allEquity.length; index += 1) {
    const previous = allEquity[index - 1].equity;
    if (previous > 0) returns.push(allEquity[index].equity / previous - 1);
  }

  const maxDrawdownPct = allEquity.reduce(
    (max, point) => Math.max(max, point.drawdownPct),
    0,
  );

  if (!allEquity.length) throw new Error("Walk-forward portfolio produced no equity points");

  return {
    initialCapital,
    finalEquity: capital,
    totalReturnPct: ((capital / initialCapital) - 1) * 100,
    maxDrawdownPct,
    sharpe: annualizedSharpe(returns),
    sortino: annualizedSortino(returns),
    totalSignals,
    executedTrades,
    closedTrades,
    rejectedTrades,
    winningTrades,
    losingTrades,
    totalRealizedPnl,
    totalFees,
    totalSlippage,
    maxOpenPositions,
    maxGrossExposure,
    riskGateBlocks,
    equityCurve: allEquity,
    folds: foldSummaries,
  };
}

export interface WalkForwardPortfolioOptions {
  walkForwardRunId: number;
  initialCapital?: number;
  positionSizePct?: number;
  maxGrossExposurePct?: number;
}

export async function runWalkForwardPortfolio(options: WalkForwardPortfolioOptions) {
  const sourceRun = await getWalkForwardRun(options.walkForwardRunId);
  if (!sourceRun) throw new Error(`Walk-forward Run ${options.walkForwardRunId} not found`);

  const folds = await getWalkForwardFolds(options.walkForwardRunId);
  const baselineFolds = folds
    .filter((fold) => fold.estrategia === "baseline")
    .map((fold) => ({
      foldNumber: Number(fold.fold_number),
      testStart: new Date(fold.test_start),
      testEnd: new Date(fold.test_end),
    }))
    .sort((a, b) => a.foldNumber - b.foldNumber);

  if (!baselineFolds.length) {
    throw new Error("Walk-forward run has no baseline folds; execute the signal walk-forward first");
  }

  const klines = await getMarketDataRange(
    sourceRun.ativo,
    sourceRun.timeframe,
    sourceRun.datasetStart,
    sourceRun.datasetEnd,
  );
  assertDatasetMatchesMetadata(klines, sourceRun.candlesTotal, sourceRun.datasetHash);

  const indicatorsSeries = computeIndicatorsSeries(klines);
  const preparedFolds: PreparedFold[] = [];

  for (const fold of baselineFolds) {
    const testStartIndex = klines.findIndex(
      (candle) => (candle.closeTime ?? candle.openTime).getTime() >= fold.testStart.getTime(),
    );
    const testEndIndex = klines.findIndex(
      (candle) => (candle.closeTime ?? candle.openTime).getTime() >= fold.testEnd.getTime(),
    );
    if (testStartIndex < 1 || testEndIndex <= testStartIndex) {
      throw new Error(`Invalid fold ${fold.foldNumber} boundaries`);
    }

    const trainKlines = klines.slice(0, testStartIndex);
    const thresholds = calibrateRegimeThresholds(
      trainKlines,
      trainKlines.length,
      klines[testStartIndex - 1].closeTime ?? klines[testStartIndex - 1].openTime,
    );

    const candidates = buildCandidates(
      klines,
      indicatorsSeries,
      testStartIndex,
      testEndIndex,
      sourceRun.lookaheadCandles,
      sourceRun.targetPct,
      sourceRun.stopPct,
      sourceRun.ativo,
      sourceRun.timeframe,
    );

    const regimes = new Map<number, RegimeSnapshot>();
    for (const candidate of candidates) {
      regimes.set(
        candidate.signalIndex,
        classifyRegime(
          klines[candidate.signalIndex],
          indicatorsSeries[candidate.signalIndex],
          thresholds,
        ),
      );
    }

    preparedFolds.push({
      foldNumber: fold.foldNumber,
      testStartIndex,
      testEndIndex,
      candidates,
      regimes,
    });
  }

  const initialCapital = options.initialCapital ?? DEFAULT_INITIAL_CAPITAL;
  const positionSizePct = options.positionSizePct ?? DEFAULT_POSITION_SIZE_PCT;
  const maxGrossExposurePct =
    options.maxGrossExposurePct ?? DEFAULT_MAX_GROSS_EXPOSURE_PCT;

  if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
    throw new Error("initialCapital must be greater than zero");
  }
  if (!Number.isFinite(positionSizePct) || positionSizePct <= 0 || positionSizePct > 100) {
    throw new Error("positionSizePct must be between 0 and 100");
  }
  if (!Number.isFinite(maxGrossExposurePct) || maxGrossExposurePct <= 0 || maxGrossExposurePct > 100) {
    throw new Error("maxGrossExposurePct must be between 0 and 100");
  }
  if (positionSizePct > maxGrossExposurePct) {
    throw new Error("positionSizePct cannot exceed maxGrossExposurePct");
  }

  const baseline = simulatePortfolio(
    klines,
    preparedFolds,
    initialCapital,
    positionSizePct,
    maxGrossExposurePct,
    false,
  );
  const risk = simulatePortfolio(
    klines,
    preparedFolds,
    initialCapital,
    positionSizePct,
    maxGrossExposurePct,
    true,
  );

  const firstTest = baselineFolds[0].testStart;
  const lastTest = baselineFolds[baselineFolds.length - 1].testEnd;
  const modelVersions = [
    [false, WALK_FORWARD_PORTFOLIO_MODEL_VERSION, baseline],
    [true, WALK_FORWARD_RISK_PORTFOLIO_MODEL_VERSION, risk],
  ] as const;

  const saved = [];
  for (const [riskGate, modelVersion, stats] of modelVersions) {
    const runId = await createWalkForwardPortfolioRun({
      walkForwardRunId: sourceRun.id,
      strategy: riskGate ? "baseline_risk" : "baseline",
      initialCapital,
      positionSizePct,
      maxGrossExposurePct,
      portfolioModelVersion: modelVersion,
      finalEquity: stats.finalEquity,
      totalReturnPct: stats.totalReturnPct,
      cagrPct: cagr(initialCapital, stats.finalEquity, firstTest, lastTest),
      maxDrawdownPct: stats.maxDrawdownPct,
      sharpe: stats.sharpe,
      sortino: stats.sortino,
      totalSignals: stats.totalSignals,
      executedTrades: stats.executedTrades,
      closedTrades: stats.closedTrades,
      rejectedTrades: stats.rejectedTrades,
      winningTrades: stats.winningTrades,
      losingTrades: stats.losingTrades,
      totalRealizedPnl: stats.totalRealizedPnl,
      totalFees: stats.totalFees,
      totalSlippage: stats.totalSlippage,
      maxOpenPositions: stats.maxOpenPositions,
      maxGrossExposure: stats.maxGrossExposure,
      riskGateBlocks: stats.riskGateBlocks,
    });

    for (const fold of stats.folds) {
      await saveWalkForwardPortfolioFold({
        walkForwardPortfolioRunId: runId,
        walkForwardRunId: sourceRun.id,
        foldNumber: fold.foldNumber,
        initialCapital: fold.initialCapital,
        finalEquity: fold.finalEquity,
        totalReturnPct: fold.totalReturnPct,
        maxDrawdownPct: fold.maxDrawdownPct,
        sharpe: fold.sharpe,
        sortino: fold.sortino,
        totalSignals: fold.totalSignals,
        executedTrades: fold.executedTrades,
        closedTrades: fold.closedTrades,
        rejectedTrades: fold.rejectedTrades,
        winningTrades: fold.winningTrades,
        losingTrades: fold.losingTrades,
        totalRealizedPnl: fold.totalRealizedPnl,
        totalFees: fold.totalFees,
        totalSlippage: fold.totalSlippage,
        maxOpenPositions: fold.maxOpenPositions,
        maxGrossExposure: fold.maxGrossExposure,
        riskGateBlocks: fold.riskGateBlocks,
      });
    }

    await saveWalkForwardPortfolioEquityPoints(
      stats.equityCurve.map((point) => ({
        walkForwardPortfolioRunId: runId,
        foldNumber: point.foldNumber,
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

    saved.push({
      id: runId,
      strategy: riskGate ? "baseline_risk" : "baseline",
      modelVersion,
      finalEquity: stats.finalEquity,
      totalReturnPct: stats.totalReturnPct,
      cagrPct: cagr(initialCapital, stats.finalEquity, firstTest, lastTest),
      maxDrawdownPct: stats.maxDrawdownPct,
      sharpe: stats.sharpe,
      sortino: stats.sortino,
      totalSignals: stats.totalSignals,
      executedTrades: stats.executedTrades,
      closedTrades: stats.closedTrades,
      rejectedTrades: stats.rejectedTrades,
      winningTrades: stats.winningTrades,
      losingTrades: stats.losingTrades,
      totalRealizedPnl: stats.totalRealizedPnl,
      totalFees: stats.totalFees,
      totalSlippage: stats.totalSlippage,
      maxOpenPositions: stats.maxOpenPositions,
      maxGrossExposure: stats.maxGrossExposure,
      riskGateBlocks: stats.riskGateBlocks,
      folds: stats.folds.map((fold) => ({
        foldNumber: fold.foldNumber,
        initialCapital: fold.initialCapital,
        finalEquity: fold.finalEquity,
        totalReturnPct: fold.totalReturnPct,
        maxDrawdownPct: fold.maxDrawdownPct,
        executedTrades: fold.executedTrades,
        rejectedTrades: fold.rejectedTrades,
        winningTrades: fold.winningTrades,
        losingTrades: fold.losingTrades,
        riskGateBlocks: fold.riskGateBlocks,
      })),
    });
  }

  return {
    walkForwardRunId: sourceRun.id,
    asset: sourceRun.ativo,
    timeframe: sourceRun.timeframe,
    candles: sourceRun.candlesTotal,
    datasetHash: sourceRun.datasetHash,
    model: {
      initialCapital,
      positionSizePct,
      maxGrossExposurePct,
      executionModelVersion: sourceRun.executionModelVersion,
      portfolioModelVersions: [
        WALK_FORWARD_PORTFOLIO_MODEL_VERSION,
        WALK_FORWARD_RISK_PORTFOLIO_MODEL_VERSION,
      ],
    },
    strategies: saved,
  };
}
