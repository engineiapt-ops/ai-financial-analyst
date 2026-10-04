import { strict as assert } from "node:assert";
import type { Kline } from "../types.js";
import { PriceProviderRegistry } from "./providers/priceProviderRegistry.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./providers/priceProvider.js";
import { MarketDataService } from "./service.js";
import { MarketDataPipeline } from "./pipeline.js";

function candle(close: number): Kline {
  const closeTime = new Date(Date.now() - 60_000);
  return {
    openTime: new Date(closeTime.getTime() - 60 * 60 * 1000 + 1),
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 10,
    closeTime,
  };
}

function provider(id: string, close: number): PriceProvider {
  return {
    id,
    async getCandles(_query: PriceQuery) {
      return [candle(close)];
    },
    getMetadata(query: PriceQuery): PriceProviderMetadata {
      return {
        provider: id,
        instrument: query.instrument,
        timeframe: query.timeframe,
        source: "broker",
        quoteMode: "bid_ask",
      };
    },
  };
}

const service = new MarketDataService(
  new PriceProviderRegistry([
    provider("saxo-sim", 100),
    provider("ig-demo", 100.02),
  ]),
);

const result = await new MarketDataPipeline(service).load({
  provider: "saxo-sim",
  instrument: "FxSpot:21",
  timeframe: "1h",
  comparisonProviders: ["ig-demo"],
  maxRelativeDeviationBps: 5,
});

assert.equal(result.provenance.provider, "saxo-sim");
assert.equal(result.consistency.status, "consistent");
assert.equal(result.comparisonSnapshots.length, 1);

console.log("market data pipeline tests passed");
