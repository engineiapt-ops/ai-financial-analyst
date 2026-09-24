import type { Kline } from "../types.js";

export const SLIPPAGE_PCT = 0.0005;
export const FEE_PCT = 0.001;

export interface TradeOutcome {
  entryPrice: number;
  exitPrice: number | null;
  outcome: "win" | "loss" | "open";
  profitPercent: number;
  candlesHeld: number;
}

function validateInputs(
  side: "BUY" | "SELL",
  signalCandle: Kline,
  futureCandles: Kline[],
  targetPct: number,
  stopPct: number,
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

export function simulateTrade(
  side: "BUY" | "SELL",
  signalCandle: Kline,
  futureCandles: Kline[],
  targetPct: number,
  stopPct: number,
): TradeOutcome {
  validateInputs(side, signalCandle, futureCandles, targetPct, stopPct);

  const direction = side === "BUY" ? 1 : -1;
  const entryPrice = signalCandle.close * (1 + direction * SLIPPAGE_PCT);
  const targetPrice = entryPrice * (1 + direction * targetPct);
  const stopPrice = entryPrice * (1 - direction * stopPct);

  for (let index = 0; index < futureCandles.length; index += 1) {
    const candle = futureCandles[index];

    // Conservative rule: if target and stop are both inside the same candle,
    // count the stop first because intrabar order is unknown.
    const hitTarget = direction === 1
      ? candle.high >= targetPrice
      : candle.low <= targetPrice;

    const hitStop = direction === 1
      ? candle.low <= stopPrice
      : candle.high >= stopPrice;

    if (hitStop) {
      const exitPrice = stopPrice * (1 - direction * FEE_PCT);
      return {
        entryPrice,
        exitPrice,
        outcome: "loss",
        profitPercent: pct(entryPrice, exitPrice, direction),
        candlesHeld: index + 1,
      };
    }

    if (hitTarget) {
      const exitPrice = targetPrice * (1 - direction * FEE_PCT);
      return {
        entryPrice,
        exitPrice,
        outcome: "win",
        profitPercent: pct(entryPrice, exitPrice, direction),
        candlesHeld: index + 1,
      };
    }
  }

  return {
    entryPrice,
    exitPrice: null,
    outcome: "open",
    profitPercent: 0,
    candlesHeld: futureCandles.length,
  };
}

function pct(entry: number, exit: number, direction: number): number {
  return ((exit - entry) / entry) * direction * 100;
}
