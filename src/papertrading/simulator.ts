import type { Kline } from "../types.js";

export const EXECUTION_MODEL_VERSION = "v2";
export const SLIPPAGE_PCT = 0.0005;
export const FEE_PCT = 0.001;

export interface ExecutionCosts {
  slippagePct: number;
  feePct: number;
}

export const DEFAULT_EXECUTION_COSTS: Readonly<ExecutionCosts> = {
  slippagePct: SLIPPAGE_PCT,
  feePct: FEE_PCT,
};

export type ExitReason = "target" | "stop" | "end";

export interface TradeOutcome {
  signalPrice: number;
  entryPrice: number;
  exitPrice: number | null;
  outcome: "win" | "loss" | "open";
  profitPercent: number;
  grossProfitPercent: number;
  feePercent: number;
  slippagePercent: number;
  candlesHeld: number;
  exitReason: ExitReason;
  targetPrice: number;
  stopPrice: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
}

function validateInputs(
  side: "BUY" | "SELL",
  signalCandle: Kline,
  futureCandles: Kline[],
  targetPct: number,
  stopPct: number,
  costs: ExecutionCosts,
): void {
  if (side !== "BUY" && side !== "SELL") throw new Error("Lado inválido.");
  if (!Number.isFinite(signalCandle.close) || signalCandle.close <= 0) {
    throw new Error("Preço de fechamento do sinal inválido.");
  }
  if (!Number.isFinite(targetPct) || targetPct <= 0) {
    throw new Error("targetPct deve ser maior que zero.");
  }
  if (!Number.isFinite(stopPct) || stopPct <= 0) {
    throw new Error("stopPct deve ser maior que zero.");
  }
  if (!Number.isFinite(costs.slippagePct) || costs.slippagePct < 0 || costs.slippagePct >= 1) {
    throw new Error("slippagePct deve estar entre 0 e 1.");
  }
  if (!Number.isFinite(costs.feePct) || costs.feePct < 0 || costs.feePct >= 1) {
    throw new Error("feePct deve estar entre 0 e 1.");
  }
  for (const candle of futureCandles) {
    if (
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      candle.high < candle.low
    ) {
      throw new Error("Candle futuro inválido.");
    }
  }
}

function fillPrice(rawPrice: number, side: "BUY" | "SELL", action: "entry" | "exit", slippagePct: number): number {
  const isBuying = action === "entry" ? side === "BUY" : side === "SELL";
  return rawPrice * (isBuying ? 1 + slippagePct : 1 - slippagePct);
}

function feePercent(notional: number, feePct: number, baseEntryNotional: number): number {
  return (notional * feePct / baseEntryNotional) * 100;
}

function excursion(
  side: "BUY" | "SELL",
  entryPrice: number,
  candle: Kline,
): { favorable: number; adverse: number } {
  if (side === "BUY") {
    return {
      favorable: ((candle.high - entryPrice) / entryPrice) * 100,
      adverse: ((candle.low - entryPrice) / entryPrice) * 100,
    };
  }
  return {
    favorable: ((entryPrice - candle.low) / entryPrice) * 100,
    adverse: ((entryPrice - candle.high) / entryPrice) * 100,
  };
}

function pct(entry: number, exit: number, direction: number): number {
  return ((exit - entry) / entry) * direction * 100;
}

export function simulateTrade(
  side: "BUY" | "SELL",
  signalCandle: Kline,
  futureCandles: Kline[],
  targetPct: number,
  stopPct: number,
  costs: ExecutionCosts = DEFAULT_EXECUTION_COSTS,
): TradeOutcome {
  validateInputs(side, signalCandle, futureCandles, targetPct, stopPct, costs);

  const direction = side === "BUY" ? 1 : -1;
  const signalPrice = signalCandle.close;
  const entryPrice = fillPrice(signalPrice, side, "entry", costs.slippagePct);
  const targetPrice = entryPrice * (1 + direction * targetPct);
  const stopPrice = entryPrice * (1 - direction * stopPct);

  let maxFavorableExcursionPct = 0;
  let maxAdverseExcursionPct = 0;

  for (let index = 0; index < futureCandles.length; index += 1) {
    const candle = futureCandles[index];
    const currentExcursion = excursion(side, entryPrice, candle);
    maxFavorableExcursionPct = Math.max(maxFavorableExcursionPct, currentExcursion.favorable);
    maxAdverseExcursionPct = Math.min(maxAdverseExcursionPct, currentExcursion.adverse);

    const hitTarget = direction === 1
      ? candle.high >= targetPrice
      : candle.low <= targetPrice;

    const hitStop = direction === 1
      ? candle.low <= stopPrice
      : candle.high >= stopPrice;

    if (hitStop || hitTarget) {
      // Conservative rule: when both are inside the same candle, stop wins.
      const outcome: "win" | "loss" = hitStop ? "loss" : "win";
      const exitReason: ExitReason = hitStop ? "stop" : "target";
      const rawExitPrice = hitStop ? stopPrice : targetPrice;
      const exitPrice = fillPrice(rawExitPrice, side, "exit", costs.slippagePct);
      const grossProfitPercent = pct(entryPrice, exitPrice, direction);
      const entryFeePercent = feePercent(entryPrice, costs.feePct, entryPrice);
      const exitFeePercent = feePercent(exitPrice, costs.feePct, entryPrice);
      const totalFeePercent = entryFeePercent + exitFeePercent;
      const slippagePercent =
        (Math.abs(signalPrice - entryPrice) / signalPrice +
          Math.abs(rawExitPrice - exitPrice) / rawExitPrice) * 100;

      return {
        signalPrice,
        entryPrice,
        exitPrice,
        outcome,
        profitPercent: grossProfitPercent - totalFeePercent,
        grossProfitPercent,
        feePercent: totalFeePercent,
        slippagePercent,
        candlesHeld: index + 1,
        exitReason,
        targetPrice,
        stopPrice,
        maxFavorableExcursionPct,
        maxAdverseExcursionPct,
      };
    }
  }

  const slippagePercent =
    (Math.abs(signalPrice - entryPrice) / signalPrice) * 100;

  return {
    signalPrice,
    entryPrice,
    exitPrice: null,
    outcome: "open",
    profitPercent: 0,
    grossProfitPercent: 0,
    feePercent: feePercent(entryPrice, costs.feePct, entryPrice),
    slippagePercent,
    candlesHeld: futureCandles.length,
    exitReason: "end",
    targetPrice,
    stopPrice,
    maxFavorableExcursionPct,
    maxAdverseExcursionPct,
  };
}
