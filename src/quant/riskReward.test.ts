import { strict as assert } from "node:assert";
import { assessRiskReward, assertMinimumRiskReward } from "./riskReward.js";

assert.equal(assessRiskReward(0.02, 0.01).passed, true);
assert.equal(assessRiskReward(0.019, 0.01).passed, false);
assert.equal(assertMinimumRiskReward(0.02, 0.01).ratio, 2);
assert.throws(() => assertMinimumRiskReward(0.019, 0.01), /Risk\/reward rejected/);

console.log("risk reward tests passed");
