import type { Kline } from "../types.js";

export type PriceActionBias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface PriceActionSnapshot {
  version: "price-action-v1";
  bias: PriceActionBias;
  higherHigh: boolean;
  higherLow: boolean;
  lowerHigh: boolean;
  lowerLow: boolean;
  support: number | null;
  resistance: number | null;
}

export function analyzePriceAction(klines: readonly Kline[], lookback = 3): PriceActionSnapshot {
  if (!Number.isInteger(lookback) || lookback < 2) {
    throw new Error("lookback must be an integer >= 2");
  }

  if (klines.length < lookback + 1) {
    return {
      version: "price-action-v1",
      bias: "NEUTRAL",
      higherHigh: false,
      higherLow: false,
      lowerHigh: false,
      lowerLow: false,
      support: null,
      resistance: null,
    };
  }

  const previous = klines.slice(-(lookback + 1), -1);
  const current = klines[klines.length - 1];
  const previousHigh = Math.max(...previous.map((item) => item.high));
  const previousLow = Math.min(...previous.map((item) => item.low));

  const higherHigh = current.high > previousHigh;
  const higherLow = current.low > previousLow;
  const lowerHigh = current.high < previousHigh;
  const lowerLow = current.low < previousLow;

  const bias: PriceActionBias =
    higherHigh && higherLow ? "BULLISH" :
    lowerHigh && lowerLow ? "BEARISH" :
    "NEUTRAL";

  return {
    version: "price-action-v1",
    bias,
    higherHigh,
    higherLow,
    lowerHigh,
    lowerLow,
    support: previousLow,
    resistance: previousHigh,
  };
}
