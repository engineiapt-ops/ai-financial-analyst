import type { Kline } from "../types.js";
import type { MarketDataQuality } from "./quality.js";
import type { PriceProviderMetadata } from "./providers/priceProvider.js";

export const MARKET_DATA_PROVENANCE_VERSION = "market-data-provenance.v1";

export interface MarketDataProvenance {
  version: typeof MARKET_DATA_PROVENANCE_VERSION;
  provider: string;
  instrument: string;
  timeframe: string;
  source: PriceProviderMetadata["source"];
  quoteMode: PriceProviderMetadata["quoteMode"];
  candleCount: number;
  dataAsOf: string;
  checkedAt: string;
  qualityStatus: MarketDataQuality["status"];
}

export function createMarketDataProvenance(input: {
  metadata: PriceProviderMetadata;
  candles: readonly Kline[];
  quality: MarketDataQuality;
}): MarketDataProvenance {
  if (!input.candles.length) {
    throw new Error("Market data provenance requires at least one candle");
  }

  const latest = input.candles[input.candles.length - 1];
  const dataAsOf = latest.closeTime ?? latest.openTime;

  return {
    version: MARKET_DATA_PROVENANCE_VERSION,
    provider: input.metadata.provider,
    instrument: input.metadata.instrument,
    timeframe: input.metadata.timeframe,
    source: input.metadata.source,
    quoteMode: input.metadata.quoteMode,
    candleCount: input.candles.length,
    dataAsOf: dataAsOf.toISOString(),
    checkedAt: input.quality.checkedAt,
    qualityStatus: input.quality.status,
  };
}
