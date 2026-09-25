import assert from "node:assert/strict";
import { assertDatasetMatchesMetadata, computeDatasetHash } from "./dataset.js";

const candles = [
  { openTime: new Date("2026-01-01T00:00:00Z"), open: 100, high: 110, low: 90, close: 105, volume: 10 },
  { openTime: new Date("2026-01-01T01:00:00Z"), open: 105, high: 115, low: 100, close: 112, volume: 12 },
];

const hash = computeDatasetHash(candles);

assert.equal(assertDatasetMatchesMetadata(candles, candles.length, hash), hash);
assert.throws(() => assertDatasetMatchesMetadata(candles, candles.length + 1, hash), /Dataset candle count mismatch/);
assert.throws(() => assertDatasetMatchesMetadata(candles, candles.length, "invalid-hash"), /Dataset hash mismatch/);
assert.throws(() => assertDatasetMatchesMetadata(candles, null, hash), /complete dataset metadata/);
assert.throws(() => assertDatasetMatchesMetadata(candles, candles.length, null), /complete dataset metadata/);

console.log("dataset integrity tests: PASS");
