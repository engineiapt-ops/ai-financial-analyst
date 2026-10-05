import { strict as assert } from "node:assert";
import type { Kline } from "../types.js";
import { PriceProviderRegistry } from "./providers/priceProviderRegistry.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./providers/priceProvider.js";
import { MarketDataService } from "./service.js";
import { MarketDataPipeline } from "./pipeline.js";

// Shared deterministic timestamp keeps both provider fixtures on the same candle boundary.
function candle(close: number, openTime = "2026-10-05T12:00:00.000Z"): Kline {
  const open = new Date(openTime);
  const closeTime = new Date(open.getTime() + 60 * 60 * 1000 - 1);
  return {
    openTime: open,
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

// Canonical EURUSD resolution must translate to Saxo's provider-native identifier.
const canonicalResult = await new MarketDataPipeline(service).load({
  provider: "saxo-sim",
  instrument: "ignored-provider-native-value",
  canonicalInstrument: "EURUSD",
  timeframe: "1h",
});

assert.equal(canonicalResult.primary.metadata.instrument, "FxSpot:21");
assert.equal(canonicalResult.provenance.instrument, "FxSpot:21");

await assert.rejects(
  () =>
    new MarketDataPipeline(service).load({
      provider: "ig-demo",
      instrument: "ignored-provider-native-value",
      canonicalInstrument: "EURUSD",
      timeframe: "1h",
    }),
  /mapping is not verified/i,
);

console.log("market data pipeline tests passed");
