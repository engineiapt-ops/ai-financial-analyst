import type { Timeframe } from "../types.js";
import type { PriceProvider } from "./providers/priceProvider.js";
import { PriceProviderRegistry } from "./providers/priceProviderRegistry.js";
import { MarketDataPipeline, type MarketDataPipelineRequest, type MarketDataPipelineResult } from "./pipeline.js";
import { MarketDataService } from "./service.js";

export function createMarketDataPipeline(
  providers: readonly PriceProvider[],
): MarketDataPipeline {
  return new MarketDataPipeline(new MarketDataService(new PriceProviderRegistry([...providers])));
}

export async function loadMarketData(
  pipeline: MarketDataPipeline,
  request: MarketDataPipelineRequest,
  checkedAt = new Date(),
): Promise<MarketDataPipelineResult> {
  if (!request.instrument.trim()) throw new Error("Market data instrument is required");
  if (!request.provider.trim()) throw new Error("Market data provider is required");
  return pipeline.load(request, checkedAt);
}

export function assertSupportedTimeframe(timeframe: string): asserts timeframe is Timeframe {
  if (!["1h", "4h", "1d"].includes(timeframe)) {
    throw new Error(`Unsupported market data timeframe: ${timeframe}`);
  }
}
