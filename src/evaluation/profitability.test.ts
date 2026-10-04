import assert from "node:assert/strict";
import {
  buildAlwaysWaitBaseline,
  buildBuyAndHoldTrade,
  evaluateProfitability,
  evaluateWalkForward,
  PROFITABILITY_EVALUATION_VERSION,
} from "./profitability.js";

const trades = [
  { grossProfitPct: 1, feePct: 0.1, slippagePct: 0.05 },
  { grossProfitPct: -0.5, feePct: 0.1, slippagePct: 0.05 },
  { grossProfitPct: 0.8, feePct: 0.1, slippagePct: 0.05 },
];

const evaluation = evaluateProfitability("baseline_no_jev", trades, 3);
assert.equal(evaluation.version, PROFITABILITY_EVALUATION_VERSION);
assert.equal(evaluation.summary.closedTrades, 3);
assert.equal(evaluation.summary.winningTrades, 2);
assert.equal(evaluation.summary.losingTrades, 1);
assert.equal(evaluation.summary.totalGrossProfitPct, 1.3);
assert.equal(evaluation.summary.totalCostPct, 0.45);
assert.equal(Number(evaluation.summary.totalNetProfitPct.toFixed(10)), 0.85);
assert.equal(evaluation.summary.sufficientSample, true);
assert.equal(evaluation.stress.length, 3);
assert.deepEqual(
  evaluation.stress.map((scenario) => scenario.costIncreasePct),
  [25, 50, 100],
);
assert.ok(
  evaluation.stress[2].totalNetProfitPct <
    evaluation.stress[0].totalNetProfitPct,
);

const alwaysWait = buildAlwaysWaitBaseline();
assert.equal(alwaysWait.summary.totalTrades, 0);
assert.equal(alwaysWait.summary.totalNetProfitPct, 0);
assert.equal(alwaysWait.summary.expectancyPct, null);
assert.equal(alwaysWait.warnings.length, 1);

const buyHold = buildBuyAndHoldTrade(100, 110, 0.1, 0.05);
assert.equal(buyHold.grossProfitPct, 10);
assert.equal(buyHold.feePct, 0.1);
assert.equal(buyHold.slippagePct, 0.05);

const walkForward = evaluateWalkForward(
  [
    { instrument: "BTCUSDT", fold: 1, trades },
    {
      instrument: "BTCUSDT",
      fold: 2,
      trades: [{ grossProfitPct: 0.6, feePct: 0.1, slippagePct: 0.05 }],
    },
  ],
  2,
);
assert.equal(walkForward.instrument, "BTCUSDT");
assert.equal(walkForward.folds.length, 2);
assert.equal(walkForward.aggregate.summary.closedTrades, 4);
assert.equal(walkForward.aggregate.summary.sufficientSample, true);

assert.throws(
  () =>
    evaluateProfitability("invalid", [
      { grossProfitPct: Number.NaN, feePct: 0, slippagePct: 0 },
    ]),
  /Invalid profitability trade/,
);

console.log("profitability evaluation tests passed");
