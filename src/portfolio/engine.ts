import {
  createPortfolioRun,
  finalizePortfolioRun,
  getBacktestRun,
  getMarketDataRange,
  getPortfolioSourceTrades,
  savePortfolioPositions,
  savePortfolioEquityPoints,
  type PortfolioEquityPointInput,
  type PortfolioPositionInput,
  type PortfolioRunSummary,
  type PortfolioSourceTrade,
} from "../db/repository.js";
import { assertDatasetMatchesMetadata } from "../marketdata/dataset.js";
import { FEE_PCT, SLIPPAGE_PCT } from "../papertrading/simulator.js";
import type { Kline, Timeframe } from "../types.js";
import { calibrateRegimeThresholds, buildRegimeSeries } from "../risk/regime.js";
import {
  evaluateRiskV2,
  RISK_MAX_GROSS_EXPOSURE_PCT,
  RISK_POSITION_SIZE_PCT,
} from "../risk/riskEngine.js";

export const PORTFOLIO_MODEL_VERSION = "portfolio-v1";
export const RISK_AWARE_PORTFOLIO_MODEL_VERSION = "portfolio-v1-risk-regime-v1";
export const DEFAULT_INITIAL_CAPITAL = 1000;
export const DEFAULT_POSITION_SIZE_PCT = RISK_POSITION_SIZE_PCT;
export const DEFAULT_MAX_GROSS_EXPOSURE_PCT = RISK_MAX_GROSS_EXPOSURE_PCT;

interface ActivePosition {
  trade: PortfolioSourceTrade;
  notional: number;
  quantity: number;
  entryFee: number;
  openedAt: Date;
}

interface PositionResult extends PortfolioPositionInput {}

interface EquityPoint {
  asOf: Date;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
  grossExposure: number;
  openPositions: number;
  drawdownPct: number;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function annualizedSharpe(returns: number[]): number | null {
  const sigma = stddev(returns);
  if (!returns.length || sigma === 0) return null;
  return (mean(returns) / sigma) * Math.sqrt(24 * 365);
}

function annualizedSortino(returns: number[]): number | null {
  const downside = returns.filter((value) => value < 0);
  const downsideDeviation = downside.length
    ? Math.sqrt(mean(downside.map((value) => value ** 2)))
    : 0;
  if (!returns.length || downsideDeviation === 0) return null;
  return (mean(returns) / downsideDeviation) * Math.sqrt(24 * 365);
}

function cagr(initialCapital: number, finalEquity: number, start: Date, end: Date): number | null {
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  if (hours <= 0 || initialCapital <= 0 || finalEquity <= 0) return null;
  return ((finalEquity / initialCapital) ** ((24 * 365) / hours) - 1) * 100;
}

function markPosition(
  position: ActivePosition,
  rawPrice: number,
): { netPnl: number; grossPnl: number; exitFee: number } {
  const estimatedExitPrice = position.trade.side === "BUY"
    ? rawPrice * (1 - SLIPPAGE_PCT)
    : rawPrice * (1 + SLIPPAGE_PCT);

  const direction = position.trade.side === "BUY" ? 1 : -1;
  const grossPnl = (estimatedExitPrice - position.trade.entryPrice)
    * position.quantity
    * direction;
  const exitNotional = Math.abs(estimatedExitPrice * position.quantity);
  const exitFee = exitNotional * FEE_PCT;
  return {
    grossPnl,
    exitFee,
    netPnl: grossPnl - exitFee,
  };
}

function closeAtStoredExecution(
  position: ActivePosition,
): { netPnl: number; grossPnl: number; totalFees: number; slippage: number; exitPrice: number } {
  const trade = position.trade;
  const grossPnl = position.notional * ((trade.grossProfitPercent ?? trade.profitPercent) / 100);
  const totalFees = position.notional * ((trade.feePercent ?? (FEE_PCT * 200)) / 100);
  const slippage = position.notional * ((trade.slippagePercent ?? (SLIPPAGE_PCT * 100)) / 100);
  const netPnl = position.notional * (trade.profitPercent / 100);
  return {
    netPnl,
    grossPnl,
    totalFees,
    slippage,
    exitPrice: trade.exitPrice ?? position.trade.entryPrice,
  };
}

function closeAtEnd(
  position: ActivePosition,
  rawPrice: number,
): { netPnl: number; grossPnl: number; totalFees: number; slippage: number; exitPrice: number } {
  const estimatedExitPrice = position.trade.side === "BUY"
    ? rawPrice * (1 - SLIPPAGE_PCT)
    : rawPrice * (1 + SLIPPAGE_PCT);
  const direction = position.trade.side === "BUY" ? 1 : -1;
  const grossPnl = (estimatedExitPrice - position.trade.entryPrice)
    * position.quantity
    * direction;
  const exitNotional = Math.abs(estimatedExitPrice * position.quantity);
  const exitFee = exitNotional * FEE_PCT;
  const totalFees = position.entryFee + exitFee;
  const slippage = position.notional * SLIPPAGE_PCT + exitNotional * SLIPPAGE_PCT;
  return {
    netPnl: grossPnl - position.entryFee - exitFee,
    grossPnl,
    totalFees,
    slippage,
    exitPrice: estimatedExitPrice,
  };
}

function isSameOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

export interface PortfolioRunOptions {
  sourceRunId: number;
  initialCapital?: number;
  positionSizePct?: number;
  maxGrossExposurePct?: number;
  riskGate?: boolean;
}

export interface PortfolioEngineDependencies {
  createPortfolioRun: typeof createPortfolioRun;
  finalizePortfolioRun: typeof finalizePortfolioRun;
  getBacktestRun: typeof getBacktestRun;
  getMarketDataRange: typeof getMarketDataRange;
  getPortfolioSourceTrades: typeof getPortfolioSourceTrades;
  savePortfolioPositions: typeof savePortfolioPositions;
  savePortfolioEquityPoints: typeof savePortfolioEquityPoints;
  assertDatasetMatchesMetadata: typeof assertDatasetMatchesMetadata;
  calibrateRegimeThresholds: typeof calibrateRegimeThresholds;
  buildRegimeSeries: typeof buildRegimeSeries;
  evaluateRiskV2: typeof evaluateRiskV2;
}

const DEFAULT_DEPENDENCIES: PortfolioEngineDependencies = {
  createPortfolioRun,
  finalizePortfolioRun,
  getBacktestRun,
  getMarketDataRange,
  getPortfolioSourceTrades,
  savePortfolioPositions,
  savePortfolioEquityPoints,
  assertDatasetMatchesMetadata,
  calibrateRegimeThresholds,
  buildRegimeSeries,
  evaluateRiskV2,
};

export async function runPortfolioEngine(
  options: PortfolioRunOptions,
  dependencies: Partial<PortfolioEngineDependencies> = {},
) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const initialCapital = options.initialCapital ?? DEFAULT_INITIAL_CAPITAL;
  const positionSizePct = options.positionSizePct ?? DEFAULT_POSITION_SIZE_PCT;
  const maxGrossExposurePct = options.maxGrossExposurePct ?? DEFAULT_MAX_GROSS_EXPOSURE_PCT;
  const riskGate = options.riskGate ?? false;

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

  const sourceRun = await deps.getBacktestRun(options.sourceRunId);
  if (!sourceRun) throw new Error(`Run ${options.sourceRunId} not found`);
  const klines = await deps.getMarketDataRange(
    sourceRun.ativo,
    sourceRun.timeframe,
    sourceRun.periodoInicio,
    sourceRun.periodoFim,
  );
  deps.assertDatasetMatchesMetadata(klines, sourceRun.candlesTotal, sourceRun.datasetHash);

  const riskRegimes = riskGate
    ? buildRegimeSeries(
        klines,
        deps.calibrateRegimeThresholds(
          klines,
          Math.floor(klines.length * (sourceRun.oosStartRatio ?? 0.7)),
          new Date((klines[Math.floor(klines.length * (sourceRun.oosStartRatio ?? 0.7)) - 1].closeTime
            ?? klines[Math.floor(klines.length * (sourceRun.oosStartRatio ?? 0.7)) - 1].openTime).getTime()),
        ),
      )
    : [];
  const riskRegimeByTime = new Map(riskRegimes.map((regime) => [regime.dataAsOf.getTime(), regime]));

  const trades = await deps.getPortfolioSourceTrades(options.sourceRunId);
  const portfolioRunId = await deps.createPortfolioRun({
    sourceBacktestRunId: options.sourceRunId,
    ativo: sourceRun.ativo,
    timeframe: sourceRun.timeframe,
    initialCapital,
    positionSizePct,
    maxGrossExposurePct,
    portfolioModelVersion: riskGate ? RISK_AWARE_PORTFOLIO_MODEL_VERSION : PORTFOLIO_MODEL_VERSION,
    datasetHash: sourceRun.datasetHash ?? "",
  });

  const entriesByTime = new Map<number, PortfolioSourceTrade[]>();
  for (const trade of trades) {
    const key = trade.openedAt.getTime();
    const list = entriesByTime.get(key) ?? [];
    list.push(trade);
    entriesByTime.set(key, list);
  }

  const exitsByTime = new Map<number, PortfolioSourceTrade[]>();
  for (const trade of trades) {
    if (!trade.closedAt) continue;
    const key = trade.closedAt.getTime();
    const list = exitsByTime.get(key) ?? [];
    list.push(trade);
    exitsByTime.set(key, list);
  }

  const active = new Map<number, ActivePosition>();
  const positionResults: PositionResult[] = [];
  const equityCurve: EquityPoint[] = [];
  let cash = initialCapital;
  let realizedPnl = 0;
  let peakEquity = initialCapital;
  let rejectedTrades = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  let riskGateBlocks = 0;

  for (const candle of klines) {
    const asOf = candle.closeTime ?? candle.openTime;

    // First settle all positions whose execution model produced an exit at this candle.
    for (const trade of exitsByTime.get(asOf.getTime()) ?? []) {
      const position = active.get(trade.paperTradeId);
      if (!position) continue;

      const result = closeAtStoredExecution(position);
      cash += position.notional + result.grossPnl
        - Math.max(0, result.totalFees - position.entryFee);
      realizedPnl += result.netPnl;
      totalFees += result.totalFees;
      totalSlippage += result.slippage;
      active.delete(trade.paperTradeId);

      positionResults.push({
        portfolioRunId,
        paperTradeId: trade.paperTradeId,
        side: trade.side,
        allocatedNotional: position.notional,
        entryPrice: trade.entryPrice,
        exitPrice: result.exitPrice,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
        status: "closed",
        netPnl: result.netPnl,
        grossPnl: result.grossPnl,
        fees: result.totalFees,
        slippage: result.slippage,
        returnPct: trade.profitPercent,
      });
    }

    let unrealizedPnl = 0;
    let grossExposure = 0;
    for (const position of active.values()) {
      const mark = markPosition(position, candle.close);
      unrealizedPnl += mark.netPnl;
      grossExposure += position.notional;
    }

    let equity = cash + [...active.values()].reduce((sum, position) => {
      const mark = markPosition(position, candle.close);
      return sum + position.notional + mark.netPnl;
    }, 0);
    peakEquity = Math.max(peakEquity, equity);

    // New decisions become positions only after exits are processed.
    for (const trade of entriesByTime.get(asOf.getTime()) ?? []) {
      if (active.has(trade.paperTradeId)) continue;

      if (riskGate) {
        const regime = riskRegimeByTime.get(asOf.getTime());
        if (!regime) {
          throw new Error(`Missing frozen regime for entry timestamp ${asOf.toISOString()}`);
        }
        const risk = deps.evaluateRiskV2({
          decision: {
            origem: "baseline",
            recomendacao: trade.side,
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
          stopDistancePct: sourceRun.stopPct * 100,
        });
        if (!risk.allowed) {
          riskGateBlocks += 1;
          rejectedTrades += 1;
          positionResults.push({
            portfolioRunId,
            paperTradeId: trade.paperTradeId,
            side: trade.side,
            allocatedNotional: 0,
            entryPrice: trade.entryPrice,
            exitPrice: null,
            openedAt: trade.openedAt,
            closedAt: null,
            status: "rejected",
            rejectionReason: `risk_gate_${risk.reason}`,
          });
          continue;
        }
      }

      const remainingExposure = Math.max(
        0,
        equity * (maxGrossExposurePct / 100) - grossExposure,
      );
      const requestedNotional = equity * (positionSizePct / 100);
      const notional = Math.min(requestedNotional, remainingExposure);

      if (notional <= 0) {
        rejectedTrades += 1;
        positionResults.push({
          portfolioRunId,
          paperTradeId: trade.paperTradeId,
          side: trade.side,
          allocatedNotional: 0,
          entryPrice: trade.entryPrice,
          exitPrice: null,
          openedAt: trade.openedAt,
          closedAt: null,
          status: "rejected",
          rejectionReason: "max_gross_exposure_reached",
        });
        continue;
      }

      const entryFee = notional * FEE_PCT;
      cash -= notional + entryFee;
      const quantity = notional / trade.entryPrice;
      active.set(trade.paperTradeId, {
        trade,
        notional,
        quantity,
        entryFee,
        openedAt: trade.openedAt,
      });
      grossExposure += notional;
    }

    unrealizedPnl = 0;
    grossExposure = 0;
    for (const position of active.values()) {
      unrealizedPnl += markPosition(position, candle.close).netPnl;
      grossExposure += position.notional;
    }
    equity = cash + [...active.values()].reduce((sum, position) => {
      return sum + position.notional + markPosition(position, candle.close).netPnl;
    }, 0);
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct = peakEquity > 0
      ? ((peakEquity - equity) / peakEquity) * 100
      : 0;

    equityCurve.push({
      asOf,
      equity,
      cash,
      realizedPnl,
      unrealizedPnl,
      grossExposure,
      openPositions: active.size,
      drawdownPct,
    });
  }

  const finalCandle = klines[klines.length - 1];
  const finalPrice = finalCandle.close;

  for (const position of [...active.values()]) {
    const result = closeAtEnd(position, finalPrice);
    cash += position.notional + result.grossPnl
      - Math.max(0, result.totalFees - position.entryFee);
    realizedPnl += result.netPnl;
    totalFees += result.totalFees;
    totalSlippage += result.slippage;
    active.delete(position.trade.paperTradeId);

    positionResults.push({
      portfolioRunId,
      paperTradeId: position.trade.paperTradeId,
      side: position.trade.side,
      allocatedNotional: position.notional,
      entryPrice: position.trade.entryPrice,
      exitPrice: result.exitPrice,
      openedAt: position.trade.openedAt,
      closedAt: finalCandle.closeTime ?? finalCandle.openTime,
      status: "liquidated_end",
      netPnl: result.netPnl,
      grossPnl: result.grossPnl,
      fees: result.totalFees,
      slippage: result.slippage,
      returnPct: position.notional ? (result.netPnl / position.notional) * 100 : 0,
    });
  }

  const finalEquity = cash;
  const finalAsOf = finalCandle.closeTime ?? finalCandle.openTime;
  const previousEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : initialCapital;
  if (equityCurve.length && Math.abs(previousEquity - finalEquity) > Number.EPSILON) {
    const peak = Math.max(peakEquity, finalEquity);
    equityCurve.push({
      asOf: new Date(finalAsOf.getTime() + 1),
      equity: finalEquity,
      cash: finalEquity,
      realizedPnl,
      unrealizedPnl: 0,
      grossExposure: 0,
      openPositions: 0,
      drawdownPct: peak > 0 ? ((peak - finalEquity) / peak) * 100 : 0,
    });
  }

  const returns: number[] = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1].equity;
    if (previous > 0) returns.push(equityCurve[index].equity / previous - 1);
  }

  const closedResults = positionResults.filter((position) => position.status !== "rejected");
  const winningTrades = closedResults.filter((position) => (position.netPnl ?? 0) > 0).length;
  const losingTrades = closedResults.filter((position) => (position.netPnl ?? 0) < 0).length;
  const totalPositive = closedResults.reduce((sum, position) => sum + Math.max(0, position.netPnl ?? 0), 0);
  const totalNegative = closedResults.reduce((sum, position) => sum + Math.min(0, position.netPnl ?? 0), 0);
  const maxDrawdownPct = equityCurve.reduce((max, point) => Math.max(max, point.drawdownPct), 0);

  const summary: PortfolioRunSummary = {
    finalEquity,
    totalReturnPct: ((finalEquity / initialCapital) - 1) * 100,
    cagrPct: cagr(initialCapital, finalEquity, klines[0].closeTime ?? klines[0].openTime, finalAsOf),
    maxDrawdownPct,
    sharpe: annualizedSharpe(returns),
    sortino: annualizedSortino(returns),
    totalTrades: trades.length,
    closedTrades: closedResults.length,
    winningTrades,
    losingTrades,
    rejectedTrades,
    totalRealizedPnl: realizedPnl,
    totalUnrealizedPnl: 0,
    totalFees,
    totalSlippage,
  };

  await deps.savePortfolioPositions(positionResults);
  await deps.savePortfolioEquityPoints(equityCurve.map((point) => ({
    portfolioRunId,
    asOf: point.asOf,
    equity: point.equity,
    cash: point.cash,
    realizedPnl: point.realizedPnl,
    unrealizedPnl: point.unrealizedPnl,
    grossExposure: point.grossExposure,
    openPositions: point.openPositions,
    drawdownPct: point.drawdownPct,
  })));

  await deps.finalizePortfolioRun(portfolioRunId, summary);

  return {
    portfolioRunId,
    sourceRunId: options.sourceRunId,
    ativo: sourceRun.ativo,
    timeframe: sourceRun.timeframe,
    datasetHash: sourceRun.datasetHash,
    portfolioModelVersion: riskGate ? RISK_AWARE_PORTFOLIO_MODEL_VERSION : PORTFOLIO_MODEL_VERSION,
    riskGate,
    riskGateBlocks,
    initialCapital,
    positionSizePct,
    maxGrossExposurePct,
    ...summary,
    equityPoints: equityCurve.length,
  };
}
