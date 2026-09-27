import { strict as assert } from "node:assert";
import {
  buildGovernanceDashboardOverview,
  GOVERNANCE_DASHBOARD_VERSION,
} from "./governanceDashboard.js";

const system = {
  version: "system-readiness.v1",
  generatedAt: "2026-09-27T10:00:00.000Z",
  state: "ready",
  checks: {
    api: { state: "ready", detail: "ok" },
    authentication: { state: "ready", configured: true, detail: "ok" },
    configuration: {
      state: "ready",
      productionMode: true,
      configured: ["DATABASE_URL", "API_AUTH_TOKEN"],
      missing: [],
      invalid: [],
      warnings: [],
      detail: "ok",
    },
    marketData: { state: "ready", detail: "ok" },
    database: { state: "ready", detail: "ok" },
    aiProviders: { state: "degraded", configured: [], detail: "none" },
    execution: { state: "ready", paperTradingOnly: true, detail: "paper only" },
    governance: {
      state: "ready",
      contracts: [
        "evaluation-overview.v1",
        "operational-quality.v1",
        "pipeline-audit.v1",
        "pipeline-audit-history.v1",
        "governance-dashboard.v1",
      ],
      detail: "ok",
    },
  },
  notes: [],
} as const;

const marketData = {
  version: "market-data-quality.v1",
  status: "fresh",
  timeframe: "1h",
  checkedAt: "2026-09-27T10:00:00.000Z",
  dataAsOf: "2026-09-27T09:55:00.000Z",
  ageMs: 300000,
  maxAgeMs: 5400000,
} as const;

const evaluation = {
  version: "evaluation-overview.v1",
  generatedAt: "2026-09-27T10:00:00.000Z",
  period: {
    from: "2026-09-26T10:00:00.000Z",
    to: "2026-09-27T10:00:00.000Z",
  },
  filters: { ativo: "BTCUSDT", timeframe: "1h" },
  decisionQuality: {
    totalDecisions: 10,
    settledDecisions: 8,
    pendingDecisions: 2,
    winRate: 50,
    avgForwardReturnPercent: 0.1,
    avgTradeProfitPercent: 0.08,
    totalTradeProfitPercent: 0.64,
    avgConfidence: 0.6,
    avgQualityScore: 0.7,
  },
  calibration: {
    sampleCount: 8,
    sufficientSample: true,
    brierScore: 0.2,
    expectedCalibrationError: 0.05,
  },
  governance: {
    auditCount: 1,
    latestByStrategy: [],
    readyCount: 1,
    blockedCount: 0,
  },
} as const;

const operationalQuality = {
  version: "operational-quality.v1",
  generatedAt: "2026-09-27T10:00:00.000Z",
  state: "ready",
  scope: { asset: "BTCUSDT", timeframe: "1h", portfolioRunId: 41 },
  checks: {
    system: { state: "ready", readinessState: "ready" },
    marketData: {
      state: "ready",
      status: "fresh",
      ageMs: 300000,
      maxAgeMs: 5400000,
      dataAsOf: "2026-09-27T09:55:00.000Z",
    },
    quantitativeGovernance: {
      state: "ready",
      calibrationSufficient: true,
      auditCount: 1,
      readyAuditCount: 1,
      blockedAuditCount: 0,
    },
    portfolio: {
      state: "ready",
      available: true,
      allChecksPassed: true,
      foldCount: 5,
      stabilityCoveragePct: 100,
    },
    executionInvariant: { state: "ready", paperTradingOnly: true },
  },
  contracts: {
    systemReadiness: "system-readiness.v1",
    marketDataQuality: "market-data-quality.v1",
    evaluationOverview: "evaluation-overview.v1",
    portfolioGovernance: "portfolio-governance-overview.v2",
  },
  notes: [],
} as const;

const pipeline = {
  version: "pipeline-audit.v1",
  generatedAt: "2026-09-27T10:00:00.000Z",
  state: "ready",
  scope: {
    walkForwardRunId: 41,
    asset: "BTCUSDT",
    timeframe: "1h",
    datasetHash: "a".repeat(64),
    candlesTotal: 1000,
  },
  traceability: {
    dataset: { present: true, hash: "a".repeat(64), candlesTotal: 1000 },
    oos: {
      auditCount: 1,
      latestByStrategy: [{
        strategy: "baseline",
        id: 11,
        status: "ready",
        walkForwardRunId: 41,
        evidenceHash: "b".repeat(64),
        gateVersion: "oos-validation-gate.v1",
        createdAt: "2026-09-27T09:00:00.000Z",
      }],
      requiredStrategies: ["baseline"],
    },
    portfolio: {
      available: true,
      walkForwardRunId: 41,
      datasetHash: "a".repeat(64),
      foldCount: 5,
      stabilityCoveragePct: 100,
      contractVersion: "portfolio-governance-overview.v2",
    },
    product: {
      operationalQualityVersion: "operational-quality.v1",
      operationalQualityState: "ready",
    },
  },
  checks: [],
  blockingReasons: [],
  warnings: [],
  evidenceHash: "c".repeat(64),
  interpretation: {
    readyMeans: "traceable",
    notAnInvestmentVerdict: true,
  },
};

const result = buildGovernanceDashboardOverview({
  generatedAt: new Date("2026-09-27T10:00:00.000Z"),
  asset: "btcusdt",
  timeframe: "1h",
  lookbackDays: 30,
  system,
  marketData,
  evaluation,
  operationalQuality,
  portfolio: null,
  pipelineAudit: pipeline,
  pipelineHistory: [{
    snapshotId: 1,
    createdAt: "2026-09-27T09:00:00.000Z",
    state: "ready",
    evidenceHash: "c".repeat(64),
    datasetHash: "a".repeat(64),
    regressionFromPrevious: null,
  }],
});

assert.equal(result.version, GOVERNANCE_DASHBOARD_VERSION);
assert.equal(result.state, "ready");
assert.equal(result.scope.asset, "BTCUSDT");
assert.equal(result.scope.walkForwardRunId, 41);
assert.equal(result.evidence.datasetHash, "a".repeat(64));
assert.equal(result.evidence.currentPipelineEvidenceHash, "c".repeat(64));
assert.equal(result.evidence.oosEvidenceHashes.length, 1);
assert.equal(result.pipeline.history.length, 1);
assert.deepEqual(result.traceability.chain, [
  "dataset",
  "oos",
  "walk-forward",
  "portfolio",
  "product",
]);
assert.equal(result.guardrails.paperTradingOnly, true);
assert.equal(result.guardrails.deterministicDecisionAuthoritative, true);
assert.equal(result.interpretation.notAnInvestmentVerdict, true);

const blocked = buildGovernanceDashboardOverview({
  generatedAt: new Date("2026-09-27T10:00:00.000Z"),
  asset: "BTCUSDT",
  timeframe: "1h",
  lookbackDays: 30,
  system: { ...system, state: "blocked" },
  marketData,
  evaluation,
  operationalQuality,
});

assert.equal(blocked.state, "blocked");

console.log("governance dashboard tests passed");
