import { fetchKlines } from "../binanceClient.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";

export class BinanceSpotPriceProvider implements PriceProvider {
  readonly id = "binance-spot";

  async getCandles(query: PriceQuery) {
    return fetchKlines(query.instrument, query.timeframe, {
      limit: query.limit ?? 500,
      startTime: query.startTime,
      endTime: query.endTime,
    });
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
}
