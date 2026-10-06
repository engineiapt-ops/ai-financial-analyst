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


const openCandle: Kline = {
  openTime: new Date("2026-10-04T11:00:00.000Z"),
  closeTime: new Date("2026-10-04T12:59:59.999Z"),
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 10,
};

const closedCandle: Kline = {
  openTime: new Date("2026-10-04T10:00:00.000Z"),
  closeTime: new Date("2026-10-04T10:59:59.999Z"),
  open: 99,
  high: 101,
  low: 98,
  close: 100,
  volume: 10,
};

const closedCandleService = new MarketDataService(new PriceProviderRegistry([
  provider("binance", [closedCandle, openCandle]),
]));

const closedSnapshot = await closedCandleService.getSnapshot({
  provider: "binance",
  instrument: "BTCUSDT",
  timeframe: "1h",
  limit: 2,
}, new Date("2026-10-04T12:29:59.999Z"));

assert.equal(closedSnapshot.candles.length, 1);
assert.equal(closedSnapshot.candles[0].close, 100);
assert.equal(closedSnapshot.quality.dataAsOf, "2026-10-04T10:59:59.999Z");


console.log("MarketDataService tests passed");


const historyProvider = provider("history", [
  candle("2026-10-04T08:00:00.000Z", 98),
  candle("2026-10-04T09:00:00.000Z", 99),
  candle("2026-10-04T10:00:00.000Z", 100),
]);
historyProvider.getHistory = async (query) => {
  assert.equal(query.instrument, "BTCUSDT");
  assert.equal(query.timeframe, "1h");
  assert.equal(query.totalCandles, 3);
  return historyProvider.__history ?? [];
};
(historyProvider as PriceProvider & { __history?: Kline[] }).__history = [
  candle("2026-10-04T08:00:00.000Z", 98),
  {
    ...candle("2026-10-04T10:00:00.000Z", 100),
    closeTime: new Date("2026-10-04T12:59:59.999Z"),
  },
  candle("2026-10-04T09:00:00.000Z", 99),
];

const historyService = new MarketDataService(
  new PriceProviderRegistry([historyProvider]),
);
const history = await historyService.getHistory({
  provider: "history",
  instrument: "BTCUSDT",
  timeframe: "1h",
  totalCandles: 3,
  endTime: new Date("2026-10-04T12:00:00.000Z").getTime(),
});
assert.equal(history.length, 2);
assert.deepEqual(history.map((item) => item.close), [98, 99]);

await assert.rejects(
  () => historyService.getHistory({
    provider: "history",
    instrument: "BTCUSDT",
    timeframe: "1h",
    totalCandles: 0,
  }),
  /totalCandles must be a positive integer/,
);

const noHistoryService = new MarketDataService(
  new PriceProviderRegistry([provider("no-history", [candle("2026-10-04T10:00:00.000Z", 100)])]),
);
await assert.rejects(
  () => noHistoryService.getHistory({
    provider: "no-history",
    instrument: "BTCUSDT",
    timeframe: "1h",
    totalCandles: 2,
  }),
  /Historical market data is not supported by provider: no-history/,
);
