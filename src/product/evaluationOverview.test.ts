import { strict as assert } from "node:assert";
import { buildCalibrationReport } from "../evaluation/calibration.js";
import { buildEvaluationOverview } from "./evaluationOverview.js";

const now = new Date("2026-09-26T14:00:00.000Z");
const observations = Array.from({ length: 30 }, () => ({
  confidence: 0.7,
  qualityScore: 0.65,
  tradeProfitPercent: 0.5,
  origem: "baseline",
  ativo: "BTCUSDT",
  timeframe: "1h" as const,
  riskRegime: "normal",
}));
const calibration = buildCalibrationReport(observations, {
  ativo: "BTCUSDT",
  timeframe: "1h",
  from: new Date("2026-09-25T00:00:00.000Z"),
  to: now,
});

const kpis = {
  filters: {},
  summary: {
    totalDecisions: 42,
    settledDecisions: 30,
    pendingDecisions: 12,
    notApplicableDecisions: 0,
    profitableDecisions: 18,
    losingDecisions: 10,
    flatDecisions: 2,
    winRate: 60,
    avgForwardReturnPercent: 0.8,
    avgTradeProfitPercent: 0.6,
    totalTradeProfitPercent: 18,
    avgConfidence: 0.7,
    avgQualityScore: 0.65,
    riskElevatedDecisions: 3,
    buyDecisions: 15,
    sellDecisions: 15,
    waitDecisions: 12,
  },
  breakdown: [],
};

const overview = buildEvaluationOverview({
  generatedAt: now,
  from: new Date("2026-09-25T00:00:00.000Z"),
  to: now,
  ativo: "btcusdt",
  timeframe: "1h",
  kpis,
  calibration,
  audits: [
    {
      id: 2,
      estrategia: "baseline",
      status: "ready",
      evidenceHash: "a".repeat(64),
      createdAt: now,
    },
    {
      id: 1,
      estrategia: "baseline",
      status: "blocked",
      evidenceHash: "b".repeat(64),
      createdAt: new Date("2026-09-25T10:00:00.000Z"),
    },
  ],
});

assert.equal(overview.version, "evaluation-overview.v1");
assert.equal(overview.filters.ativo, "BTCUSDT");
assert.equal(overview.decisionQuality.winRate, 60);
assert.equal(overview.calibration.sampleCount, 30);
assert.equal(overview.calibration.sufficientSample, true);
assert.equal(overview.governance.auditCount, 2);
assert.equal(overview.governance.latestByStrategy.length, 1);
assert.equal(overview.governance.latestByStrategy[0].status, "ready");

console.log("evaluation overview tests passed");
