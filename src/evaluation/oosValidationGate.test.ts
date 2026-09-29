import { strict as assert } from "node:assert";
import { buildCalibrationReport, type CalibrationObservation } from "./calibration.js";
import { buildOosValidationReport, type OosFoldRow } from "./oosValidationReport.js";
import { buildOosRobustnessReport } from "./oosRobustness.js";
import {
  buildOosValidationGate,
  computeOosValidationGateEvidenceHash,
  MIN_GATE_CLOSED_TRADES,
  MIN_GATE_FOLDS,
} from "./oosValidationGate.js";

function fold(
  foldNumber: number,
  returnPct: number,
): OosFoldRow {
  return {
    fold_number: foldNumber,
    train_start: new Date("2025-01-01T00:00:00Z"),
    train_end: new Date("2025-02-01T00:00:00Z"),
    test_start: new Date(`2026-0${foldNumber + 1}-01T00:00:00Z`),
    test_end: new Date(`2026-0${foldNumber + 1}-20T00:00:00Z`),
    estrategia: "baseline",
    status: "ok",
    test_signals: 25,
    total_trades: 10,
    closed_trades: 10,
    open_trades: 0,
    win_rate: 50,
    profit_factor: 1.2,
    total_profit_percent: returnPct,
    avg_profit_percent: returnPct / 10,
    expectancy_percent: returnPct / 10,
    max_drawdown_percent: 4,
    gross_total_profit_percent: returnPct + 1,
    total_fee_percent: 0.5,
    total_slippage_percent: 0.5,
    avg_candles_held: 4,
    notas: null,
  };
}

const observations: CalibrationObservation[] = Array.from({ length: 30 }, (_, index) => ({
  confidence: index % 2 === 0 ? 0.6 : 0.8,
  qualityScore: 0.7,
  tradeProfitPercent: index % 3 === 0 ? 1 : -0.5,
  origem: "baseline",
  ativo: "BTCUSDT",
  timeframe: "1h",
  riskRegime: "NORMAL",
}));

const calibration = buildCalibrationReport(observations, {
  ativo: "BTCUSDT",
  timeframe: "1h",
  from: new Date("2026-02-01T00:00:00Z"),
  to: new Date("2026-06-20T00:00:00Z"),
});

const decisionKpis = {
  filters: {},
  summary: {
    totalDecisions: 30,
    settledDecisions: 30,
    pendingDecisions: 0,
    notApplicableDecisions: 0,
    profitableDecisions: 10,
    losingDecisions: 20,
    flatDecisions: 0,
    winRate: 33.33,
    avgForwardReturnPercent: 0.1,
    avgTradeProfitPercent: 0.2,
    totalTradeProfitPercent: 6,
    avgConfidence: 0.7,
    avgQualityScore: 0.7,
    riskElevatedDecisions: 5,
    buyDecisions: 15,
    sellDecisions: 15,
    waitDecisions: 0,
  },
  breakdown: [],
};

const backtestRun = {
  id: 10,
  mode: "oos" as const,
  ativo: "BTCUSDT",
  timeframe: "1h" as const,
  periodoInicio: new Date("2025-01-01T00:00:00Z"),
  periodoFim: new Date("2026-06-20T00:00:00Z"),
  oosStartRatio: 0.7,
  calibrationEnd: new Date("2026-01-31T23:00:00Z"),
  validationStart: new Date("2026-02-01T00:00:00Z"),
  evaluationPolicyVersion: "oos-policy.v1",
  datasetHash: "abc",
  candlesTotal: 1000,
};

const walkForwardRun = {
  id: 20,
  ativo: "BTCUSDT" as const,
  timeframe: "1h" as const,
  datasetStart: new Date("2025-01-01T00:00:00Z"),
  datasetEnd: new Date("2026-06-20T00:00:00Z"),
  candlesTotal: 1000,
  datasetHash: "abc",
  initialTrainCandles: 700,
  testCandles: 100,
  stepCandles: 100,
  lookaheadCandles: 20,
  executionModelVersion: "exec-v1",
  targetPct: 0.01,
  stopPct: 0.005,
  slippagePct: 0.001,
  feePct: 0.001,
};

const folds = [
  fold(1, 2),
  fold(2, -1),
  fold(3, 3),
  fold(4, -2),
  fold(5, 1),
];

const validationReport = buildOosValidationReport({
  backtestRun,
  walkForwardRun,
  folds,
  calibration,
  decisionKpis,
});

const robustnessReport = buildOosRobustnessReport({
  backtestRun,
  walkForwardRunId: walkForwardRun.id,
  walkForwardDatasetHash: walkForwardRun.datasetHash,
  folds,
  iterations: 1000,
});

const readyGate = buildOosValidationGate({
  strategy: "baseline",
  validationReport,
  robustnessReport,
  generatedAt: new Date("2026-06-21T00:00:00Z"),
});

assert.equal(readyGate.status, "ready");
assert.equal(readyGate.blockingReasons.length, 0);
assert.equal(readyGate.evidenceHash.length, 64);
assert.equal(
  computeOosValidationGateEvidenceHash({
    gateVersion: readyGate.gateVersion,
    strategy: readyGate.strategy,
    validationReport,
    robustnessReport,
    checks: readyGate.checks,
  }),
  readyGate.evidenceHash,
);
const repeatedGate = buildOosValidationGate({
  strategy: "baseline",
  validationReport,
  robustnessReport,
  generatedAt: new Date("2026-06-22T00:00:00Z"),
});
assert.equal(repeatedGate.evidenceHash, readyGate.evidenceHash);

assert.equal(
  readyGate.checks.find((check) => check.key === "minimum-folds")?.passed,
  true,
);
assert.equal(
  readyGate.checks.find((check) => check.key === "minimum-closed-trades")?.passed,
  true,
);

const blockedRobustness = buildOosRobustnessReport({
  backtestRun,
  walkForwardRunId: walkForwardRun.id,
  walkForwardDatasetHash: "different-hash",
  folds: folds.slice(0, MIN_GATE_FOLDS - 1),
  iterations: 1000,
});

const blockedGate = buildOosValidationGate({
  strategy: "baseline",
  validationReport,
  robustnessReport: blockedRobustness,
});

assert.equal(blockedGate.status, "blocked");
assert.ok(blockedGate.blockingReasons.length > 0);
assert.equal(
  blockedGate.checks.find((check) => check.key === "minimum-folds")?.passed,
  false,
);
assert.equal(
  blockedGate.checks.find((check) => check.key === "dataset-integrity")?.passed,
  false,
);
assert.equal(
  blockedGate.checks.find((check) => check.key === "minimum-closed-trades")?.passed,
  true,
);

console.log("oos validation gate tests passed");
