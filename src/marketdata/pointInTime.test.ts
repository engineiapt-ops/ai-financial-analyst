import assert from "node:assert/strict";
import {
  assertKlinesAvailableAsOf,
  assertNewsAvailableAsOf,
  createPointInTimeContext,
  filterNewsByAsOf,
} from "./pointInTime.js";
import type { Kline } from "../types.js";
import type { NewsHeadline } from "../features/sentimentPipeline.js";

function kline(openTime: string, closeTime: string): Kline {
  return {
    openTime: new Date(openTime),
    closeTime: new Date(closeTime),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 10,
  };
}

function headline(publishedAt: string, title = "BTC update"): NewsHeadline {
  return { source: "test", title, publishedAt: new Date(publishedAt) };
}

const asOf = new Date("2026-09-25T10:00:00Z");

const context = createPointInTimeContext(asOf);
assert.equal(context.asOf.toISOString(), "2026-09-25T10:00:00.000Z");

assert.doesNotThrow(() =>
  assertKlinesAvailableAsOf(
    [kline("2026-09-25T09:00:00Z", "2026-09-25T10:00:00Z")],
    asOf,
  ),
);

assert.throws(
  () =>
    assertKlinesAvailableAsOf(
      [kline("2026-09-25T10:00:00Z", "2026-09-25T10:00:01Z")],
      asOf,
    ),
  /Point-in-time violation/,
);

const headlines = [
  headline("2026-09-25T09:59:00Z", "before"),
  headline("2026-09-25T10:00:00Z", "exact"),
  headline("2026-09-25T10:01:00Z", "after"),
];

const filtered = filterNewsByAsOf(headlines, asOf);
assert.deepEqual(filtered.map((h) => h.title), ["before", "exact"]);

assert.doesNotThrow(() => assertNewsAvailableAsOf(filtered, asOf));
assert.throws(() => assertNewsAvailableAsOf(headlines, asOf), /Point-in-time violation/);

console.log("point-in-time tests: PASS");
