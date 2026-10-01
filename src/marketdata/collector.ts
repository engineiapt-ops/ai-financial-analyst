import { fetchKlines, SUPPORTED_TIMEFRAMES } from "./binanceClient.js";
import { saveMarketData } from "../db/repository.js";
import type { Kline, Timeframe } from "../types.js";

export interface MarketDataCollectionResult {
  symbol: string;
  timeframes: Timeframe[];
  fetched: number;
  saved: number;
  candlesByTimeframe: Record<Timeframe, number>;
  collectedAt: string;
}

function isClosedCandle(candle: Kline, nowMs: number): boolean {
  return candle.closeTime.getTime() <= nowMs;
}

export async function collectLatestMarketData(
  symbol = "BTCUSDT",
  timeframes: readonly Timeframe[] = SUPPORTED_TIMEFRAMES,
): Promise<MarketDataCollectionResult> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol) throw new Error("symbol is required");

  const uniqueTimeframes = [...new Set(timeframes)];
  for (const timeframe of uniqueTimeframes) {
    if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
      throw new Error(`timeframe not supported: ${timeframe}`);
    }
  }

  const nowMs = Date.now();
  const candlesByTimeframe = {} as Record<Timeframe, number>;
  let fetched = 0;
  let saved = 0;

  for (const timeframe of uniqueTimeframes) {
    const batch = await fetchKlines(cleanSymbol, timeframe, 2);
    fetched += batch.length;

    const closed = batch.filter((candle) => isClosedCandle(candle, nowMs));
    candlesByTimeframe[timeframe] = closed.length;

    if (closed.length > 0) {
      saved += await saveMarketData(cleanSymbol, timeframe, closed);
    }
  }

  return {
    symbol: cleanSymbol,
    timeframes: uniqueTimeframes,
    fetched,
    saved,
    candlesByTimeframe,
    collectedAt: new Date().toISOString(),
  };
}
