import assert from "node:assert/strict";
import {
  buildOosEvaluationPlan,
  assertOosTimestampsSeparated,
  DEFAULT_OOS_START_RATIO,
  OOS_EVALUATION_POLICY_VERSION,
} from "./oosPolicy.js";

const plan = buildOosEvaluationPlan(1000);

assert.equal(plan.policyVersion, OOS_EVALUATION_POLICY_VERSION);
assert.equal(plan.oosStartRatio, DEFAULT_OOS_START_RATIO);
assert.equal(plan.validationStartIndex, 700);
assert.equal(plan.calibrationEndIndex, 699);
assert.equal(plan.calibrationCandleCount, 700);
assert.equal(plan.validationCandleCount, 300);
assert.ok(plan.calibrationEndIndex < plan.validationStartIndex);

const timestamps = assertOosTimestampsSeparated(
  new Date("2026-01-01T00:00:00Z"),
  new Date("2026-02-01T00:00:00Z"),
);
assert.equal(timestamps.validationStart > timestamps.calibrationEnd, true);

assert.throws(
  () => buildOosEvaluationPlan(150),
  /requires at least/,
);

assert.throws(
  () =>
    assertOosTimestampsSeparated(
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    ),
  /strictly after/,
);

console.log("OOS policy tests passed");
