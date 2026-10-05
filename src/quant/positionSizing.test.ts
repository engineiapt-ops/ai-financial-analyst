import { strict as assert } from "node:assert";
import { calculatePositionSize, MAX_RISK_PER_TRADE_PCT } from "./positionSizing.js";

const sizing = calculatePositionSize({
  equity: 10_000,
  stopDistancePct: 0.01,
  requestedRiskPct: 3,
});

assert.equal(sizing.riskPerTradePct, MAX_RISK_PER_TRADE_PCT);
assert.equal(sizing.riskAmount, 100);
assert.equal(sizing.notionalPct, 100);

assert.throws(() => calculatePositionSize({
  equity: 10_000,
  stopDistancePct: 0,
}), /stopDistancePct/);

console.log("position sizing tests passed");
