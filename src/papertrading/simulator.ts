import type { Kline } from "../types.js";

const SLIPPAGE_PCT = 0.0005;
const FEE_PCT = 0.001;

export interface TradeOutcome {
  entryPrice: number;
  exitPrice: number;
  outcome: "win" | "loss" | "open";
  profitPercent: number;
}

export function simulateTrade(
  side: "BUY" | "SELL",
  signalCandle: Kline,
  futureCandles: Kline[],
  targetPct: number,
  stopPct: number
): TradeOutcome {
  const direction = side === "BUY" ? 1 : -1;
  const entryPrice = signalCandle.close * (1 + direction * SLIPPAGE_PCT);
  const targetPrice = entryPrice * (1 + direction * targetPct);
  const stopPrice = entryPrice * (1 - direction * stopPct);
  for (const candle of futureCandles) {
    const hitTarget = direction === 1 ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = direction === 1 ? candle.low <= stopPrice : candle.high >= stopPrice;
    if (hitStop) {
      const exitPrice = stopPrice * (1 - direction * FEE_PCT);
      return { entryPrice, exitPrice, outcome: "loss", profitPercent: pct(entryPrice, exitPrice, direction) };
    }
    if (hitTarget) {
      const exitPrice = targetPrice * (1 - direction * FEE_PCT);
      return { entryPrice, exitPrice, outcome: "win", profitPercent: pct(entryPrice, exitPrice, direction) };
    }
  }
  return { entryPrice, exitPrice: entryPrice, outcome: "open", profitPercent: 0 };
}

function pct(entry: number, exit: number, direction: number): number {
  return ((exit - entry) / entry) * direction * 100;
}
