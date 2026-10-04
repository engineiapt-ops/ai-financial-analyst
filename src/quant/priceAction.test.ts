import { strict as assert } from "node:assert";
import { analyzePriceAction } from "./priceAction.js";

const base = (open: number, high: number, low: number, close: number) => ({
  openTime: new Date("2026-10-04T10:00:00.000Z"),
  open, high, low, close, volume: 1,
});

const bullish = analyzePriceAction([
  base(100, 101, 99, 100),
  base(100, 102, 100, 101),
  base(101, 103, 101, 102),
  base(102, 105, 103, 104),
]);

assert.equal(bullish.bias, "BULLISH");
assert.equal(bullish.higherHigh, true);
assert.equal(bullish.higherLow, true);

const bearish = analyzePriceAction([
  base(104, 105, 103, 104),
  base(103, 104, 102, 103),
  base(102, 103, 101, 102),
  base(101, 102, 99, 100),
]);

assert.equal(bearish.bias, "BEARISH");

console.log("price action tests passed");
