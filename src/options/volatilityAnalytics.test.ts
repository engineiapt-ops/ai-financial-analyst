import { strict as assert } from "node:assert";
import {
  calculateHistoricalVolatility,
  compareImpliedVsHistoricalVolatility,
  historicalVolatilityPeriodsPerYear,
  VOLATILITY_ANALYTICS_VERSION,
} from "./volatilityAnalytics.js";
import type { Kline } from "../types.js";

function buildCandles(closes: readonly number[]): Kline[] {
  return closes.map((close, index) => {
    const openTime = new Date(
      Date.UTC(2026, 0, 1, index, 0, 0, 0),
    );

    return {
      openTime,
      open: close,
      high: close * 1.001,
      low: close * 0.999,
      close,
      volume: 1,
      closeTime: new Date(openTime.getTime() + 60 * 60 * 1000 - 1),
    };
  });
}

const constant = calculateHistoricalVolatility(
  buildCandles([100, 100, 100, 100, 100]),
  "1d",
  5,
);

assert.equal(constant.version, VOLATILITY_ANALYTICS_VERSION);
assert.equal(constant.observations, 4);
assert.equal(constant.annualizationPeriods, 365);
assert.equal(constant.annualizedVolatility, 0);

const volatile = calculateHistoricalVolatility(
  buildCandles([100, 102, 99, 104, 101, 105, 100, 103]),
  "1d",
  8,
);

assert.ok(volatile.annualizedVolatility > 0);
assert.equal(volatile.dataAsOf.toISOString(), "2026-01-01T07:59:59.999Z");

const hourly = calculateHistoricalVolatility(
  buildCandles([100, 101, 99, 102, 98]),
  "1h",
  5,
);
const fourHourlyPeriods = historicalVolatilityPeriodsPerYear("4h");

assert.equal(hourly.annualizationPeriods, 8760);
assert.equal(fourHourlyPeriods, 2190);
assert.ok(hourly.annualizedVolatility > 0);

const lookback = calculateHistoricalVolatility(
  buildCandles([100, 101, 102, 103, 104, 105]),
  "1d",
  4,
);
assert.equal(lookback.lookbackCandles, 4);
assert.equal(lookback.observations, 3);

const premium = compareImpliedVsHistoricalVolatility(0.30, 0.20, 0.10);
assert.equal(premium.state, "iv_premium");
// Floating-point arithmetic can represent 0.30 - 0.20 slightly below 0.10.
assert.ok(Math.abs(premium.spreadAbsolute - 0.10) < 1e-12);
assert.equal(premium.spreadPercentagePoints, 10);
assert.equal(premium.ratio, 1.5);

const near = compareImpliedVsHistoricalVolatility(0.205, 0.20, 0.10);
assert.equal(near.state, "near_historical");

const discount = compareImpliedVsHistoricalVolatility(0.15, 0.20, 0.10);
assert.equal(discount.state, "iv_discount");

const missing = compareImpliedVsHistoricalVolatility(null, 0.2);
assert.equal(missing.state, "insufficient_data");
assert.equal(missing.impliedVolatility, null);
assert.equal(missing.historicalVolatility, 0.2);

assert.throws(
  () => calculateHistoricalVolatility(buildCandles([100, 101]), "1d"),
  /At least 3 candles/,
);

assert.throws(
  () =>
    calculateHistoricalVolatility(
      [
        ...buildCandles([100, 101]),
        {
          ...buildCandles([102])[0],
          openTime: new Date(Date.UTC(2025, 0, 1)),
        },
      ],
      "1d",
    ),
  /strictly chronological/,
);

assert.throws(
  () => compareImpliedVsHistoricalVolatility(0.2, 0.2, 1.5),
  /toleranceRelative must be between 0 and 1/,
);

console.log("volatility analytics tests passed");
