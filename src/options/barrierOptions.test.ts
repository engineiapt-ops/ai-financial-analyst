import { strict as assert } from "node:assert";
import {
  BARRIER_OPTIONS_RISK_VERSION,
  deriveDynamicKnockOutLevel,
  evaluateBarrierOptionRisk,
  knockOutBreachedByCandle,
  type BarrierOptionContract,
} from "./barrierOptions.js";

const evaluationAt = new Date("2026-10-05T00:00:00.000Z");
const expiry = new Date("2026-12-04T00:00:00.000Z");

const validContract: BarrierOptionContract = {
  symbol: "TEST-UP-OUT-C90",
  type: "CALL",
  direction: "UP_AND_OUT",
  strike: 90,
  expiry,
  premium: 5,
  contractMultiplier: 1,
  atr: 10,
  knockoutAtrMultiple: 2,
};

assert.equal(
  deriveDynamicKnockOutLevel({
    spot: 100,
    atr: 10,
    direction: "UP_AND_OUT",
    atrMultiple: 2,
  }),
  120,
);

assert.equal(
  deriveDynamicKnockOutLevel({
    spot: 100,
    atr: 10,
    direction: "DOWN_AND_OUT",
    atrMultiple: 1.5,
  }),
  85,
);

const valid = evaluateBarrierOptionRisk(100, validContract, {
  evaluationAt,
  targetUnderlyingPrice: 115,
  accountEquity: 10_000,
  maxOneContractRiskPct: 1,
  minKnockOutDistanceAtr: 1,
});

assert.equal(valid.version, BARRIER_OPTIONS_RISK_VERSION);
assert.equal(valid.knockOutLevel, 120);
assert.equal(valid.knockOutDistance, 20);
assert.equal(valid.knockOutDistanceAtr, 2);
assert.equal(valid.maxLossPerContract, 5);
assert.ok(valid.maxLossPctOfEquity < 1);
assert.ok(valid.riskReward >= 2);
assert.equal(valid.eligible, true);
assert.deepEqual(valid.rejectionReasons, []);

const fixedBarrier: BarrierOptionContract = {
  symbol: "TEST-FIXED-C90",
  type: "CALL",
  direction: "UP_AND_OUT",
  strike: 90,
  expiry,
  premium: 5,
  knockOutLevel: 150,
};

const fixed = evaluateBarrierOptionRisk(100, fixedBarrier, {
  evaluationAt,
  targetUnderlyingPrice: 120,
  accountEquity: 10_000,
});
assert.equal(fixed.knockOutLevel, 150);
assert.equal(fixed.knockOutDistanceAtr, null);
assert.equal(fixed.eligible, true);

const lowReward = evaluateBarrierOptionRisk(
  100,
  {
    ...validContract,
    premium: 14,
  },
  {
    evaluationAt,
    targetUnderlyingPrice: 130,
    accountEquity: 10_000,
  },
);
assert.equal(lowReward.eligible, false);
assert.ok(lowReward.rejectionReasons.includes("risk_reward_below_2"));

const riskBlocked = evaluateBarrierOptionRisk(
  100,
  {
    ...validContract,
    premium: 101,
  },
  {
    evaluationAt,
    targetUnderlyingPrice: 200,
    accountEquity: 10_000,
  },
);
assert.equal(riskBlocked.eligible, false);
assert.ok(riskBlocked.rejectionReasons.includes("one_contract_risk_limit"));

const targetBlocked = evaluateBarrierOptionRisk(100, validContract, {
  evaluationAt,
  targetUnderlyingPrice: 125,
  accountEquity: 10_000,
});
assert.equal(targetBlocked.eligible, false);
assert.ok(targetBlocked.rejectionReasons.includes("target_breaches_knockout"));

const closeBarrier = evaluateBarrierOptionRisk(
  100,
  {
    ...validContract,
    knockOutLevel: 105,
    atr: 10,
  },
  {
    evaluationAt,
    targetUnderlyingPrice: 104,
    accountEquity: 10_000,
    minKnockOutDistanceAtr: 1,
  },
);
assert.equal(closeBarrier.eligible, false);
assert.ok(closeBarrier.rejectionReasons.includes("knockout_too_close_in_atr"));

const malformedDirection = {
  ...validContract,
  direction: "DOWN_AND_OUT" as const,
  knockOutLevel: 105,
};
const directionBlocked = evaluateBarrierOptionRisk(
  100,
  malformedDirection,
  {
    evaluationAt,
    targetUnderlyingPrice: 104,
    accountEquity: 10_000,
  },
);
assert.equal(directionBlocked.eligible, false);
assert.ok(directionBlocked.rejectionReasons.includes("knockout_not_below_spot"));

const expired = evaluateBarrierOptionRisk(
  100,
  validContract,
  {
    evaluationAt: new Date("2026-12-05T00:00:00.000Z"),
    targetUnderlyingPrice: 110,
    accountEquity: 10_000,
  },
);
assert.equal(expired.eligible, false);
assert.ok(expired.rejectionReasons.includes("expired"));

assert.equal(
  knockOutBreachedByCandle("UP_AND_OUT", 120, { high: 120, low: 110 }),
  true,
);
assert.equal(
  knockOutBreachedByCandle("UP_AND_OUT", 120, { high: 119.99, low: 110 }),
  false,
);
assert.equal(
  knockOutBreachedByCandle("DOWN_AND_OUT", 80, { high: 90, low: 80 }),
  true,
);
assert.equal(
  knockOutBreachedByCandle("DOWN_AND_OUT", 80, { high: 90, low: 80.01 }),
  false,
);

assert.throws(
  () =>
    deriveDynamicKnockOutLevel({
      spot: 100,
      atr: 10,
      direction: "DOWN_AND_OUT",
      atrMultiple: 20,
    }),
  /derived knockOutLevel must be greater than zero/,
);

assert.throws(
  () =>
    evaluateBarrierOptionRisk(
      100,
      validContract,
      {
        evaluationAt,
        targetUnderlyingPrice: 110,
        accountEquity: 10_000,
        maxOneContractRiskPct: 2,
      },
    ),
  /maxOneContractRiskPct must be in \(0, 1\]/,
);

console.log("barrier option risk tests passed");
