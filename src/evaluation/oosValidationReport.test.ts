import { strict as assert } from "node:assert";
import { buildCalibrationReport, type CalibrationObservation } from "./calibration.js";
import { buildOosValidationReport, type OosFoldRow } from "./oosValidationReport.js";

function makeFold(
  foldNumber: number,
  estrategia: OosFoldRow["estrategia"],
  totalProfitPercent: number,
  totalTrades = 10,
): OosFoldRow {
  return {
    fold_number: foldNumber,
    train_start: new Date("2026-01-01T00:00:00Z"),
    train_end: new Date("2026-02-01T00:00:00Z"),
    test_start: new Date(`2026-0${2 + foldNumber}-02T00:00:00Z`),
    test_end: new Date(`2026-0${2 + foldNumber}-20T00:00:00Z`),
    estrategia,
    status: "ok",
    test_signals: 20,
    total_trades: totalTrades,
    closed_trades: totalTrades,
    open_trades: 0,
    win_rate: 50,
    profit_factor: 1.2,
    total_profit_percent: totalProfitPercent,
    avg_profit_percent: totalProfitPercent / totalTrades,
    expectancy_percent: totalProfitPercent / totalTrades,
    max_drawdown_percent: 4,
    gross_total_profit_percent: totalProfitPercent + 1,
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
  from: new Date("2026-03-01T00:00:00Z"),
  to: new Date("2026-04-30T00:00:00Z"),
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

const folds = [
  makeFold(1, "baseline", 2),
  makeFold(2, "baseline", -1),
  makeFold(1, "buyhold", 4, 1),
  makeFold(2, "buyhold", -2, 1),
  makeFold(1, "jev", 3),
];

const report = buildOosValidationReport({
  backtestRun: {
    id: 10,
    mode: "oos",
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: new Date("2025-01-01T00:00:00Z"),
    periodoFim: new Date("2026-04-20T00:00:00Z"),
    oosStartRatio: 0.7,
    calibrationEnd: new Date("2026-02-28T23:00:00Z"),
    validationStart: new Date("2026-03-01T00:00:00Z"),
    evaluationPolicyVersion: "oos-policy.v1",
    datasetHash: "abc",
    candlesTotal: 1000,
  },
  calibration,
  decisionKpis,
  walkForwardRun: {
    id: 20,
    ativo: "BTCUSDT",
    timeframe: "1h",
    datasetStart: new Date("2025-01-01T00:00:00Z"),
    datasetEnd: new Date("2026-04-20T00:00:00Z"),
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
  },
  folds,
});

assert.equal(report.reportVersion, "oos-validation-report.v1");
assert.equal(report.performance.length, 3);
assert.equal(report.performance.find((item) => item.estrategia === "baseline")?.totalProfitPercent, 1);
assert.equal(report.performance.find((item) => item.estrategia === "baseline")?.profitableFoldRatePct, 50);
assert.equal(report.stability.buyhold.worstFoldReturnPct, -2);
assert.equal(report.risk, null);
assert.equal(report.calibration.sampleCount, 30);
assert.equal(report.warnings.length, 0);

const riskReport = buildOosValidationReport({
  backtestRun: {
    id: 10,
    mode: "oos",
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: new Date("2025-01-01T00:00:00Z"),
    periodoFim: new Date("2026-03-20T00:00:00Z"),
    oosStartRatio: 0.7,
    calibrationEnd: new Date("2026-02-28T23:00:00Z"),
    validationStart: new Date("2026-03-01T00:00:00Z"),
    evaluationPolicyVersion: "oos-policy.v1",
    datasetHash: "abc",
    candlesTotal: 1000,
  },
  calibration,
  decisionKpis,
  folds: [
    makeFold(1, "baseline", 2, 10),
    { ...makeFold(1, "baseline", 1, 8), estrategia: "baseline_risk", test_start: new Date("2026-03-02T00:00:00Z"), test_end: new Date("2026-03-20T00:00:00Z") },
  ],
});
assert.equal(riskReport.risk?.estimatedBlockedTrades, 2);
assert.equal(riskReport.risk?.estimatedBlockRatePct, 20);
assert.equal(riskReport.risk?.profitDeltaPercent, -1);

const managedReport = buildOosValidationReport({
  backtestRun: {
    id: 10,
    mode: "oos",
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: new Date("2025-01-01T00:00:00Z"),
    periodoFim: new Date("2026-04-30T00:00:00Z"),
    oosStartRatio: 0.7,
    calibrationEnd: new Date("2026-02-28T23:00:00Z"),
    validationStart: new Date("2026-03-01T00:00:00Z"),
    evaluationPolicyVersion: "oos-policy.v1",
    datasetHash: "abc",
    candlesTotal: 1000,
  },
  calibration,
  decisionKpis,
  folds: [
    makeFold(1, "baseline", 2, 10),
    makeFold(1, "jev", 1, 10),
    { ...makeFold(1, "baseline", 2, 10), estrategia: "baseline" },
    { ...makeFold(1, "baseline", 1, 8), estrategia: "baseline" },
  ],
});

assert.ok(managedReport.warnings.some((warning) =>
  warning.includes("walk-forward fold dataset"),
));

console.log("oos validation report tests passed");
