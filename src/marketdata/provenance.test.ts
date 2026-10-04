import { strict as assert } from "node:assert";
import { createMarketDataProvenance } from "./provenance.js";
import type { Kline } from "../types.js";

const candle: Kline = {
  openTime: new Date("2026-10-04T10:00:00.000Z"),
  open: 100,
  high: 101,
  low: 99,
  close: 100.5,
  volume: 10,
  closeTime: new Date("2026-10-04T11:00:00.000Z"),
};

const provenance = createMarketDataProvenance({
  metadata: {
    provider: "saxo-sim",
    instrument: "FxSpot:21",
    timeframe: "1h",
    source: "broker",
    quoteMode: "bid_ask",
  },
  candles: [candle],
  quality: {
    version: "market-data-quality.v1",
    status: "fresh",
    timeframe: "1h",
    checkedAt: "2026-10-04T11:01:00.000Z",
    dataAsOf: "2026-10-04T11:00:00.000Z",
    ageMs: 60_000,
    maxAgeMs: 5_400_000,
  },
});

assert.equal(provenance.version, "market-data-provenance.v1");
assert.equal(provenance.provider, "saxo-sim");
assert.equal(provenance.candleCount, 1);
assert.equal(provenance.dataAsOf, "2026-10-04T11:00:00.000Z");
assert.equal(provenance.qualityStatus, "fresh");

console.log("market data provenance tests passed");
