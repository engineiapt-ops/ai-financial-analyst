import { strict as assert } from "node:assert";
import { envNumber } from "./thresholds.js";

assert.equal(envNumber("TEST_THRESHOLD_MISSING", 0.68, { min: 0, max: 1 }), 0.68);
assert.equal(envNumber("TEST_THRESHOLD_VALID", 0.68, { min: 0, max: 1 }), 0.68);

process.env.TEST_THRESHOLD_VALID = "0.75";
assert.equal(envNumber("TEST_THRESHOLD_VALID", 0.68, { min: 0, max: 1 }), 0.75);

process.env.TEST_THRESHOLD_NAN = "abc";
assert.throws(
  () => envNumber("TEST_THRESHOLD_NAN", 0.68, { min: 0, max: 1 }),
  /TEST_THRESHOLD_NAN must be a finite number/,
);

process.env.TEST_THRESHOLD_LOW = "-0.01";
assert.throws(
  () => envNumber("TEST_THRESHOLD_LOW", 0.68, { min: 0, max: 1 }),
  /TEST_THRESHOLD_LOW must be greater than or equal to 0/,
);

process.env.TEST_THRESHOLD_HIGH = "1.01";
assert.throws(
  () => envNumber("TEST_THRESHOLD_HIGH", 0.68, { min: 0, max: 1 }),
  /TEST_THRESHOLD_HIGH must be less than or equal to 1/,
);

delete process.env.TEST_THRESHOLD_VALID;
delete process.env.TEST_THRESHOLD_NAN;
delete process.env.TEST_THRESHOLD_LOW;
delete process.env.TEST_THRESHOLD_HIGH;

console.log("threshold env validation tests passed");
