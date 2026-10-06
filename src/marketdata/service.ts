import type { Kline, Timeframe } from "../domain/trading.js";
import { normalizeMarketData } from "./normalization.js";
import {
  assertMarketDataFresh,
  type MarketDataQuality,
} from "./quality.js";
import type {
  HistoricalPriceQuery,
  PriceProviderMetadata,
  PriceQuery,
} from "./providers/priceProvider.js";
import { PriceProviderRegistry } from "./providers/priceProviderRegistry.js";

export interface MarketDataRequest extends PriceQuery {
  provider: string;

  async getHistory(
    request: MarketDataHistoryRequest,
  ): Promise<Kline[]> {
    const providerId = request.provider.trim();
    if (!providerId) throw new Error("Market data provider is required");
    if (!request.instrument.trim()) throw new Error("Market data instrument is required");
    if (!Number.isInteger(request.totalCandles) || request.totalCandles < 1) {
      throw new Error("Market data history totalCandles must be a positive integer");
    }

    const provider = this.registry.require(providerId);
    if (!provider.getHistory) {
      throw new Error(
        `Historical market data is not supported by provider: ${provider.id}`,
      );
    }

    try {
      const rawCandles = await provider.getHistory({
        instrument: request.instrument.trim(),
        timeframe: request.timeframe,
        totalCandles: request.totalCandles,
        endTime: request.endTime,
        chunkSize: request.chunkSize,
        delayMs: request.delayMs,
      });
      return normalizeMarketData(rawCandles).filter(
        (candle) =>
          candle.closeTime === undefined ||
          candle.closeTime.getTime() <= (request.endTime ?? Date.now()),
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Historical market data failed for ${provider.id}/${request.instrument}/${request.timeframe}: ${error.message}`,
          { cause: error },
        );
      }
      throw new Error(
        `Historical market data failed for ${provider.id}/${request.instrument}/${request.timeframe}`,
        { cause: error },
      );
    }
  }

}

export interface MarketDataSnapshot {
  provider: string;
  metadata: PriceProviderMetadata;
  candles: Kline[];
  quality: MarketDataQuality;
}

export interface MarketDataHistoryRequest extends HistoricalPriceQuery {
  provider: string;
}

export class MarketDataService {
  constructor(private readonly registry: PriceProviderRegistry) {}

  async getSnapshot(
    request: MarketDataRequest,
    checkedAt = new Date(),
  ): Promise<MarketDataSnapshot> {
    const providerId = request.provider.trim();
    if (!providerId) throw new Error("Market data provider is required");
    if (!request.instrument.trim()) throw new Error("Market data instrument is required");

    const provider = this.registry.require(providerId);
    const query: PriceQuery = {
      instrument: request.instrument.trim(),
      timeframe: request.timeframe,
      limit: request.limit,
      startTime: request.startTime,
      endTime: request.endTime,
    };

    try {
      const rawCandles = await provider.getCandles(query);
      const normalizedCandles = normalizeMarketData(rawCandles);
      const candles = normalizedCandles.filter(
        (candle) =>
          candle.closeTime === undefined ||
          candle.closeTime.getTime() <= checkedAt.getTime(),
      );
      const quality = assertMarketDataFresh({
        timeframe: request.timeframe,
        candles,
        checkedAt,
      });

      return {
        provider: provider.id,
        metadata: provider.getMetadata(query),
        candles,
        quality,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Market data snapshot failed for ${provider.id}/${request.instrument}/${request.timeframe}: ${error.message}`,
          { cause: error },
        );
      }
      throw new Error(
        `Market data snapshot failed for ${provider.id}/${request.instrument}/${request.timeframe}`,
        { cause: error },
      );
    }
  }
}
