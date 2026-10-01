import { strict as assert } from "node:assert";

process.env.NODE_ENV = "test";

const { collectLatestMarketData } = await import("./collector.js");

assert.equal(typeof collectLatestMarketData, "function");

console.log("market-data collector tests: OK");
