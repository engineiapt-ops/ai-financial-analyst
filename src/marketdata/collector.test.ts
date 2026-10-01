import { strict as assert } from "node:assert";

process.env.NODE_ENV = "test";

const { collectLatestMarketData, isClosedCandle } = await import("./collector.js");

const closed = { openTime: new Date("2026-10-01T04:00:00.000Z"), closeTime: new Date("2026-10-01T04:59:59.999Z"), open: 1, high: 1, low: 1, close: 1, volume: 1 };
assert.equal(isClosedCandle(closed, new Date("2026-10-01T05:00:00.000Z").getTime()), true);
assert.equal(isClosedCandle(closed, new Date("2026-10-01T04:30:00.000Z").getTime()), false);

assert.equal(typeof collectLatestMarketData, "function");

console.log("market-data collector tests: OK");
