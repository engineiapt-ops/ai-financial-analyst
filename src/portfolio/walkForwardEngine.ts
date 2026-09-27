import type { Kline } from "../types.js";
import { FEE_PCT, SLIPPAGE_PCT, type TradeOutcome } from "../papertrading/simulator.js";

export const WALK_FORWARD_PORTFOLIO_MODEL_VERSION = "portfolio-v1-walk-forward";
export const WALK_FORWARD_PORTFOLIO_RISK_MODEL_VERSION = "portfolio-v1-walk-forward-risk-regime-v1";

export interface WalkForwardPortfolioTrade {
  id: number;
  signalIndex: number;
  exitIndex: number;
  side: "BUY" | "SELL";
  outcome: TradeOutcome;
}

export interface WalkForwardPortfolioPoint {
  asOf: Date;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
  grossExposure: number;
  openPositions: number;
  drawdownPct: number;
}

export interface WalkForwardPortfolioResult {
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  sharpe: number | null;
  sortino: number | null;
  totalSignals: number;
  executedTrades: number;
  closedTrades: number;
  rejectedTrades: number;
  exposureRejectedTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalRealizedPnl: number;
  totalFees: number;
  totalSlippage: number;
  maxOpenPositions: number;
  maxGrossExposure: number;
  equityCurve: WalkForwardPortfolioPoint[];
}

interface ActivePosition {
  trade: WalkForwardPortfolioTrade;
  notional: number;
  quantity: number;
  entryFee: number;
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
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
  const downside = returns.filter((value) => value < 0);
  const downsideDeviation = downside.length
    ? Math.sqrt(mean(downside.map((value) => value ** 2)))
    : 0;
  if (!returns.length || downsideDeviation === 0) return null;
  return (mean(returns) / downsideDeviation) * Math.sqrt(24 * 365);
}

function cagr(
  initialCapital: number,
  finalEquity: number,
  start: Date,
  end: Date,
): number | null {
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  if (hours <= 0 || initialCapital <= 0 || finalEquity <= 0) return null;
  return ((finalEquity / initialCapital) ** ((24 * 365) / hours) - 1) * 100;
}

function markPosition(
  position: ActivePosition,
  rawPrice: number,
): { netPnl: number; exitFee: number } {
  const side = position.trade.side;
  const estimatedExitPrice =
    side === "BUY" ? rawPrice * (1 - SLIPPAGE_PCT) : rawPrice * (1 + SLIPPAGE_PCT);
  const direction = side === "BUY" ? 1 : -1;
  const grossPnl =
    (estimatedExitPrice - position.trade.outcome.entryPrice)
    * position.quantity
    * direction;
  const exitNotional = Math.abs(estimatedExitPrice * position.quantity);
  const exitFee = exitNotional * FEE_PCT;
  return { netPnl: grossPnl - exitFee, exitFee };
}

function closeAtStoredExecution(
  position: ActivePosition,
): {
  netPnl: number;
  grossPnl: number;
  totalFees: number;
  slippage: number;
} {
  const outcome = position.trade.outcome;
  const grossPnl =
    position.notional * (outcome.grossProfitPercent / 100);
  const totalFees =
    position.notional * (outcome.feePercent / 100);
  const slippage =
    position.notional * (outcome.slippagePercent / 100);
  return {
    netPnl: position.notional * (outcome.profitPercent / 100),
    grossPnl,
    totalFees,
    slippage,
  };
}

function closeAtEnd(
  position: ActivePosition,
  rawPrice: number,
): {
  netPnl: number;
  grossPnl: number;
  totalFees: number;
  slippage: number;
} {
  const side = position.trade.side;
  const estimatedExitPrice =
    side === "BUY" ? rawPrice * (1 - SLIPPAGE_PCT) : rawPrice * (1 + SLIPPAGE_PCT);
  const direction = side === "BUY" ? 1 : -1;
  const grossPnl =
    (estimatedExitPrice - position.trade.outcome.entryPrice)
    * position.quantity
    * direction;
  const exitNotional = Math.abs(estimatedExitPrice * position.quantity);
  const exitFee = exitNotional * FEE_PCT;
  const totalFees = position.entryFee + exitFee;
  const slippage =
    position.notional * SLIPPAGE_PCT + exitNotional * SLIPPAGE_PCT;

  return {
    netPnl: grossPnl - position.entryFee - exitFee,
    grossPnl,
    totalFees,
    slippage,
  };
}

export function simulateWalkForwardPortfolio(options: {
  klines: Kline[];
  trades: WalkForwardPortfolioTrade[];
  totalSignals: number;
  initialCapital: number;
  positionSizePct: number;
  maxGrossExposurePct: number;
}): WalkForwardPortfolioResult {
  const {
    klines,
    trades,
    totalSignals,
    initialCapital,
    positionSizePct,
    maxGrossExposurePct,
  } = options;

  if (!klines.length) throw new Error("Walk-forward portfolio requires candles");
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

  const entriesByIndex = new Map<number, WalkForwardPortfolioTrade[]>();
  const exitsByIndex = new Map<number, WalkForwardPortfolioTrade[]>();

  for (const trade of trades) {
    const entries = entriesByIndex.get(trade.signalIndex) ?? [];
    entries.push(trade);
    entriesByIndex.set(trade.signalIndex, entries);

    if (trade.outcome.outcome !== "open" && trade.outcome.exitPrice !== null) {
      const exits = exitsByIndex.get(trade.exitIndex) ?? [];
      exits.push(trade);
      exitsByIndex.set(trade.exitIndex, exits);
    }
  }

  const active = new Map<number, ActivePosition>();
  const equityCurve: WalkForwardPortfolioPoint[] = [];
  let cash = initialCapital;
  let realizedPnl = 0;
  let executedTrades = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  let exposureRejectedTrades = 0;
  let peakEquity = initialCapital;
  let maxOpenPositions = 0;
  let maxGrossExposure = 0;
  const realizedResults: number[] = [];

  for (let index = 0; index < klines.length; index += 1) {
    const candle = klines[index];
    const asOf = candle.closeTime ?? candle.openTime;

    for (const trade of exitsByIndex.get(index) ?? []) {
      const position = active.get(trade.id);
      if (!position) continue;

      const result = closeAtStoredExecution(position);
      cash += position.notional + result.netPnl + position.entryFee;
      realizedPnl += result.netPnl;
      realizedResults.push(result.netPnl);
      totalFees += result.totalFees;
      totalSlippage += result.slippage;
      active.delete(trade.id);
    }

    let grossExposure = 0;
    let unrealizedPnl = 0;

    for (const position of active.values()) {
      const mark = markPosition(position, candle.close);
      grossExposure += position.notional;
      unrealizedPnl += mark.netPnl;
    }

    let equity =
      cash
      + [...active.values()].reduce(
        (sum, position) =>
          sum
          + position.notional
          + markPosition(position, candle.close).netPnl,
        0,
      );

    peakEquity = Math.max(peakEquity, equity);

    for (const trade of entriesByIndex.get(index) ?? []) {
      const remainingExposure = Math.max(
        0,
        equity * (maxGrossExposurePct / 100) - grossExposure,
      );
      const requestedNotional = equity * (positionSizePct / 100);
      const notional = Math.min(requestedNotional, remainingExposure);

      if (notional <= 0) {
        exposureRejectedTrades += 1;
        continue;
      }

      const entryFee = notional * FEE_PCT;
      cash -= notional + entryFee;

      active.set(trade.id, {
        trade,
        notional,
        quantity: notional / trade.outcome.entryPrice,
        entryFee,
      });
      executedTrades += 1;
      grossExposure += notional;
    }

    grossExposure = 0;
    unrealizedPnl = 0;
    for (const position of active.values()) {
      grossExposure += position.notional;
      unrealizedPnl += markPosition(position, candle.close).netPnl;
    }

    equity =
      cash
      + [...active.values()].reduce(
        (sum, position) =>
          sum
          + position.notional
          + markPosition(position, candle.close).netPnl,
        0,
      );

    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct =
      peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;

    maxOpenPositions = Math.max(maxOpenPositions, active.size);
    maxGrossExposure = Math.max(maxGrossExposure, grossExposure);

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
    cash += position.notional + result.netPnl + position.entryFee;
    realizedPnl += result.netPnl;
    realizedResults.push(result.netPnl);
    totalFees += result.totalFees;
    totalSlippage += result.slippage;
    active.delete(position.trade.id);
  }

  const finalEquity = cash;
  const previousEquity = equityCurve[equityCurve.length - 1]?.equity ?? initialCapital;

  if (Math.abs(previousEquity - finalEquity) > Number.EPSILON) {
    const finalAsOf = finalCandle.closeTime ?? finalCandle.openTime;
    const finalPeak = Math.max(peakEquity, finalEquity);
    equityCurve.push({
      asOf: new Date(finalAsOf.getTime() + 1),
      equity: finalEquity,
      cash: finalEquity,
      realizedPnl,
      unrealizedPnl: 0,
      grossExposure: 0,
      openPositions: 0,
      drawdownPct:
        finalPeak > 0
          ? ((finalPeak - finalEquity) / finalPeak) * 100
          : 0,
    });
  }

  const returns: number[] = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1].equity;
    if (previous > 0) returns.push(equityCurve[index].equity / previous - 1);
  }

  const closedTrades = realizedResults.length;
  const winningTrades = realizedResults.filter((pnl) => pnl > 0).length;
  const losingTrades = realizedResults.filter((pnl) => pnl < 0).length;
  const maxDrawdownPct = equityCurve.reduce(
    (max, point) => Math.max(max, point.drawdownPct),
    0,
  );
  const finalAsOf = finalCandle.closeTime ?? finalCandle.openTime;
  const startAsOf = klines[0].closeTime ?? klines[0].openTime;

  return {
    initialCapital,
    finalEquity,
    totalReturnPct: ((finalEquity / initialCapital) - 1) * 100,
    cagrPct: cagr(initialCapital, finalEquity, startAsOf, finalAsOf),
    maxDrawdownPct,
    sharpe: annualizedSharpe(returns),
    sortino: annualizedSortino(returns),
    totalSignals,
    executedTrades,
    closedTrades,
    rejectedTrades: exposureRejectedTrades,
    exposureRejectedTrades,
    winningTrades,
    losingTrades,
    totalRealizedPnl: realizedPnl,
    totalFees,
    totalSlippage,
    maxOpenPositions,
    maxGrossExposure,
    equityCurve,
  };
}

// walk-forward portfolio engine is intentionally deterministic; model versions are frozen per run.
