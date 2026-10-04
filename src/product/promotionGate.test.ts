import assert from "node:assert/strict";
import {
  buildPromotionGate,
  PROMOTION_GATE_VERSION,
  type PromotionGateInput,
} from "./promotionGate.js";

const profitability = {
  version: "profitability-evaluation-v1",
  strategy: "baseline",
  summary: {
    totalTrades: 40,
    closedTrades: 40,
    winningTrades: 24,
    losingTrades: 16,
    winRatePct: 60,
    totalGrossProfitPct: 12,
    totalCostPct: 4,
    totalNetProfitPct: 8,
    avgNetProfitPct: 0.2,
    expectancyPct: 0.2,
    profitFactor: 1.5,
    maxDrawdownPct: 8,
    confidenceInterval95Pct: { lower: 0.05, upper: 0.35 },
    confidenceMethod: "normal_approximation",
    minTradesRequired: 30,
    sufficientSample: true,
  },
  stress: [
    { costIncreasePct: 25, costMultiplier: 1.25, totalNetProfitPct: 7, expectancyPct: 0.175, profitableTrades: 23, losingTrades: 17 },
    { costIncreasePct: 50, costMultiplier: 1.5, totalNetProfitPct: 6, expectancyPct: 0.15, profitableTrades: 22, losingTrades: 18 },
    { costIncreasePct: 100, costMultiplier: 2, totalNetProfitPct: 4, expectancyPct: 0.1, profitableTrades: 20, losingTrades: 20 },
  ],
  warnings: [],
} as any;

const base: PromotionGateInput = {
  strategy: "baseline",
  instrument: "BTCUSDT",
  profitability,
  oos: {
    sampleTrades: 40,
    requiredTrades: 30,
    folds: 5,
    requiredFolds: 5,
  },
  paper: {
    realtime: true,
    observedTrades: 40,
    requiredTrades: 30,
    observedHours: 120,
    requiredHours: 100,
  },
  operational: {
    reliabilityPct: 99,
    minimumReliabilityPct: 95,
    dataFreshnessPct: 99,
    minimumDataFreshnessPct: 95,
  },
  drawdown: {
    maxDrawdownPct: 8,
    maximumAllowedPct: 15,
  },
  broker: {
    metadataVerified: true,
    demoAvailable: true,
  },
  targetStage: "real_manual",
};

const ready = buildPromotionGate(base);
assert.equal(ready.version, PROMOTION_GATE_VERSION);
assert.equal(ready.status, "ready");
assert.equal(ready.decision, "real_manual_ready");
assert.equal(ready.blockingReasons.length, 0);
assert.equal(ready.guardrails.humanExecutionOnly, true);
assert.equal(ready.guardrails.automatedOrderRouting, false);
assert.equal(ready.guardrails.noProfitGuarantee, true);

const weakExpectancy = buildPromotionGate({
  ...base,
  profitability: {
    ...profitability,
    summary: {
      ...profitability.summary,
      expectancyPct: 0,
      confidenceInterval95Pct: { lower: -0.1, upper: 0.1 },
    },
  } as any,
});
assert.equal(weakExpectancy.status, "blocked");
assert.ok(
  weakExpectancy.blockingReasons.some((reason) =>
    reason.includes("Net expectancy"),
  ),
);
assert.ok(
  weakExpectancy.blockingReasons.some((reason) =>
    reason.includes("confidence interval"),
  ),
);

const weakStress = buildPromotionGate({
  ...base,
  profitability: {
    ...profitability,
    stress: [
      ...profitability.stress.slice(0, 2),
      { ...profitability.stress[2], totalNetProfitPct: 0 },
    ],
  } as any,
});
assert.equal(weakStress.status, "blocked");
assert.ok(
  weakStress.blockingReasons.some((reason) =>
    reason.includes("cost-stress"),
  ),
);

const noPaper = buildPromotionGate({
  ...base,
  targetStage: "paper",
  paper: {
    realtime: false,
    observedTrades: 0,
    requiredTrades: 30,
    observedHours: 0,
    requiredHours: 100,
  },
});
assert.equal(noPaper.status, "blocked");
assert.ok(
  noPaper.blockingReasons.some((reason) =>
    reason.includes("Real-time paper"),
  ),
);

const backtestOnly = buildPromotionGate({
  ...base,
  targetStage: "backtest",
  paper: {
    realtime: false,
    observedTrades: 0,
    requiredTrades: 30,
    observedHours: 0,
    requiredHours: 100,
  },
  operational: {
    reliabilityPct: 0,
    minimumReliabilityPct: 95,
    dataFreshnessPct: 0,
    minimumDataFreshnessPct: 95,
  },
  broker: {
    metadataVerified: false,
    demoAvailable: false,
  },
});
assert.equal(backtestOnly.status, "ready");
assert.equal(backtestOnly.decision, "paper_ready");

const weakOos = buildPromotionGate({
  ...base,
  oos: {
    sampleTrades: 29,
    requiredTrades: 30,
    folds: 4,
    requiredFolds: 5,
  },
});
assert.equal(weakOos.status, "blocked");
assert.ok(
  weakOos.blockingReasons.some((reason) =>
    reason.includes("OOS sample"),
  ),
);

const drawdownBlocked = buildPromotionGate({
  ...base,
  drawdown: {
    maxDrawdownPct: 16,
    maximumAllowedPct: 15,
  },
});
assert.equal(drawdownBlocked.status, "blocked");
assert.ok(
  drawdownBlocked.blockingReasons.some((reason) =>
    reason.includes("drawdown"),
  ),
);

console.log("promotion gate tests passed");
