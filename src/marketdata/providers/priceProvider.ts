import type { Kline, Timeframe } from "../../types.js";

export interface PriceQuery {
  instrument: string;
  timeframe: Timeframe;
  limit?: number;
  startTime?: number;
  endTime?: number;
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
}
