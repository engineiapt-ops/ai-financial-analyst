import type { Kline, Timeframe } from "../../domain/trading.js";

export interface PriceQuery {
  instrument: string;
  timeframe: Timeframe;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export interface HistoricalPriceQuery {
  instrument: string;
  timeframe: Timeframe;
  totalCandles: number;
  endTime?: number;
  chunkSize?: number;
  delayMs?: number;
}

export interface PriceProviderMetadata {
  provider: string;
  instrument: string;
  timeframe: Timeframe;
  source: "csv" | "binance" | "broker";
  quoteMode: "close_only" | "bid_ask";
}

export interface PriceProvider {
  readonly id: string;
  getCandles(query: PriceQuery): Promise<Kline[]>;
  getMetadata(query: PriceQuery): PriceProviderMetadata;
  getHistory?(query: HistoricalPriceQuery): Promise<Kline[]>;
}
