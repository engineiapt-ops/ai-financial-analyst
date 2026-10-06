import assert from "node:assert/strict";
import { computeIndicators } from "../features/indicators.js";
import type { MarketDataSnapshot } from "../marketdata/service.js";
import { createSaxoDecisionGateway } from "./saxoDecisionGateway.js";

function makeCandle(index: number) {
  const open = 1.1 + index * 0.0001;
  const close = open + 0.00005;
  return {
    openTime: new Date(Date.UTC(2026, 9, 1, index, 0, 0)),
    closeTime: new Date(Date.UTC(2026, 9, 1, index, 59, 59)),
    open,
    high: close + 0.00005,
    low: open - 0.00005,
    close,
    volume: 1000 + index,
  };
}

const candles = Array.from({ length: 30 }, (_, index) => makeCandle(index));
const snapshot: MarketDataSnapshot = {
  provider: "saxo-sim",
  metadata: {
    provider: "saxo-sim",
    instrument: "FxSpot:21",
    timeframe: "1h",
    source: "broker",
    quoteMode: "bid_ask",
  },
  candles,
  quality: { status: "fresh", timeframe: "1h", checkedAt: "2026-10-01T12:00:00.000Z", dataAsOf: "2026-10-01T11:59:59.000Z", ageMs: 1, maxAgeMs: 5400000 },
};

let receivedMarket: unknown;
const gateway = createSaxoDecisionGateway(
  {
    getSnapshot: async (request, checkedAt) => {
      assert.deepEqual(request, {
        provider: "saxo-sim",
        instrument: "FxSpot:21",
        timeframe: "1h",
        limit: 50,
        endTime: checkedAt.getTime(),
      });
      return snapshot;
    },
  },
  (market) => {
    receivedMarket = market;
    return {
      origem: "baseline",
      recomendacao: "WAIT",
      tamanhoPosicaoPct: 0,
      observacao: "test",
    };
  },
  async (market) => ({
    origem: "jev",
    recomendacao: "WAIT",
    tamanhoPosicaoPct: 0,
    confidence: market.indicators.rsi === null ? 0 : 1,
  }),
);

const checkedAt = new Date("2026-10-01T12:00:00Z");
const result = await gateway({
  symbol: "eurusd",
  timeframe: "1h",
  engine: "baseline",
  limit: 50,
  checkedAt,
});

assert.equal(result.origem, "baseline");
assert.equal(result.recomendacao, "WAIT");
assert.equal(result.market.ativo, "EURUSD");
assert.equal(result.market.precoAtual, candles[candles.length - 1]?.close);
assert.deepEqual(result.snapshot, snapshot);
assert.deepEqual(receivedMarket, {
  ativo: "EURUSD",
  timeframe: "1h",
  timestamp: candles[candles.length - 1]?.closeTime?.getTime(),
  dataAsOf: candles[candles.length - 1]?.closeTime?.getTime(),
  precoAtual: candles[candles.length - 1]?.close,
  indicators: computeIndicators(candles),
  noticiaSentimento: 0,
});

await assert.rejects(
  () =>
    gateway({
      symbol: "US500",
      timeframe: "1h",
      engine: "baseline",
      checkedAt,
    }),
  /No provider instrument mapping/,
);

console.log("saxoDecisionGateway tests passed");
