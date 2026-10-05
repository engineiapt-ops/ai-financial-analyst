import type { Kline } from "../../types.js";
import {
  fetchKlines,
  type KlineOptions,
  type HistoricalKlineOptions,
  fetchKlinesHistory,
} from "../binanceClient.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";

export interface BinanceProviderConfig {
  fetchCandles?: typeof fetchKlines;
  fetchHistory?: typeof fetchKlinesHistory;
}

/**
 * Binance Spot adapter.
 *
 * Keeps the existing Binance client behind the generic PriceProvider port so
 * application services do not need to know the exchange-specific API.
 */
export class BinancePriceProvider implements PriceProvider {
  readonly id = "binance";

  private readonly fetchCandles: typeof fetchKlines;
  private readonly fetchHistory: typeof fetchKlinesHistory;

  constructor(config: BinanceProviderConfig = {}) {
    this.fetchCandles = config.fetchCandles ?? fetchKlines;
    this.fetchHistory = config.fetchHistory ?? fetchKlinesHistory;
  }

  async getCandles(query: PriceQuery): Promise<Kline[]> {
    const options: KlineOptions = {
      limit: query.limit,
      startTime: query.startTime,
      endTime: query.endTime,
    };
    return this.fetchCandles(query.instrument, query.timeframe, options);
  }

  getMetadata(query: PriceQuery): PriceProviderMetadata {
    return {
      provider: this.id,
      instrument: query.instrument,
      timeframe: query.timeframe,
      source: "binance",
      quoteMode: "close_only",
    };
  }

  async getHistory(
    symbol: string,
    timeframe: PriceQuery["timeframe"],
    options: HistoricalKlineOptions,
  ): Promise<Kline[]> {
    return this.fetchHistory(symbol, timeframe, options);
  }
}
