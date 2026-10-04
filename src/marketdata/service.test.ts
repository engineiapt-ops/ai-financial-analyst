import { strict as assert } from "node:assert";
import type { Kline } from "../types.js";
import type {
  PriceProvider,
  PriceQuery,
  PriceProviderMetadata,
} from "./providers/priceProvider.js";
import { PriceProviderRegistry } from "./providers/priceProviderRegistry.js";
import { MarketDataService } from "./service.js";

function candle(time: string, close: number): Kline {
  const openTime = new Date(time);
  return {
    openTime,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 10,
  };
}

function provider(id: string, candles: Kline[]): PriceProvider {
  return {
    id,
    async getCandles(_query: PriceQuery): Promise<Kline[]> {
      return candles;
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

const checkedAt = new Date("2026-10-04T12:00:00.000Z");
const registry = new PriceProviderRegistry([
  provider("saxo-sim", [
    candle("2026-10-04T11:00:00.000Z", 101),
    candle("2026-10-04T10:00:00.000Z", 100),
  ]),
]);
const service = new MarketDataService(registry);

const snapshot = await service.getSnapshot({
  provider: "saxo-sim",
  instrument: "FxSpot:21",
  timeframe: "1h",
  limit: 2,
}, checkedAt);

assert.equal(snapshot.provider, "saxo-sim");
assert.equal(snapshot.metadata.instrument, "FxSpot:21");
assert.equal(snapshot.candles.length, 2);
assert.equal(snapshot.candles[0].close, 100);
assert.equal(snapshot.candles[1].close, 101);
assert.equal(snapshot.quality.status, "fresh");

await assert.rejects(
  () => service.getSnapshot({
    provider: "missing",
    instrument: "FxSpot:21",
    timeframe: "1h",
  }, checkedAt),
  /Price provider not registered: missing/,
);

const staleService = new MarketDataService(new PriceProviderRegistry([
  provider("stale", [candle("2026-10-03T00:00:00.000Z", 100)]),
]));

await assert.rejects(
  () => staleService.getSnapshot({
    provider: "stale",
    instrument: "FxSpot:21",
    timeframe: "1h",
  }, checkedAt),
  /Market data snapshot failed.*Market data is stale/,
);

const invalidService = new MarketDataService(new PriceProviderRegistry([
  provider("invalid", [{
    ...candle("2026-10-04T11:00:00.000Z", 100),
    high: 90,
  }]),
]));

await assert.rejects(
  () => invalidService.getSnapshot({
    provider: "invalid",
    instrument: "FxSpot:21",
    timeframe: "1h",
  }, checkedAt),
  /Market data snapshot failed.*OHLC relationship/,
);

console.log("MarketDataService tests passed");
