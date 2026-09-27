import assert from "node:assert/strict";
import {
  buildSystemValidationOverview,
  type SystemValidationOverview,
} from "./systemValidation.js";
import type { GovernanceDashboardOverview } from "./governanceDashboard.js";
import type { OutcomeSettlementAuditSummary } from "../db/repository.js";

function dashboard(state: "ready" | "degraded" | "blocked"): GovernanceDashboardOverview {
  return {
    version: "governance-dashboard.v1",
    generatedAt: "2026-09-20T13:00:00.000Z",
    state,
    scope: {
      asset: "BTCUSDT",
      timeframe: "1h",
      walkForwardRunId: 12,
      lookbackDays: 30,
    },
    system: {
      version: "system-readiness.v1",
      generatedAt: "2026-09-20T13:00:00.000Z",
      state,
      checks: {
        api: { state: "ready", detail: "ok" },
        authentication: { state: "ready", configured: true, detail: "ok" },
        configuration: {
          state,
          productionMode: true,
          configured: [],
          missing: [],
          invalid: [],
          warnings: [],
          detail: "ok",
        },
        marketData: { state: "ready", detail: "ok" },
        database: { state: "ready", detail: "ok" },
        aiProviders: { state: "ready", configured: ["gemini"], detail: "ok" },
        execution: { state: "ready", paperTradingOnly: true, detail: "ok" },
        governance: { state: "ready", contracts: [], detail: "ok" },
      },
      notes: [],
    },
    marketData: {
      version: "market-data-quality.v1",
      status: "fresh",
      timeframe: "1h",
      checkedAt: "2026-09-20T13:00:00.000Z",
      dataAsOf: "2026-09-20T12:59:59.999Z",
      ageMs: 1,
      maxAgeMs: 5400000,
    },
    evaluation: {
      version: "evaluation-overview.v1",
      generatedAt: "2026-09-20T13:00:00.000Z",
      period: {
        from: "2026-09-19T13:00:00.000Z",
        to: "2026-09-20T13:00:00.000Z",
      },
      scope: { ativo: "BTCUSDT", timeframe: "1h" },
      kpis: {
        filters: {},
        summary: {
          totalDecisions: 3,
          settledDecisions: 2,
          pendingDecisions: 1,
          notApplicableDecisions: 0,
          profitableDecisions: 1,
          losingDecisions: 1,
          flatDecisions: 0,
          winRate: 50,
          avgForwardReturnPercent: 0,
          avgTradeProfitPercent: 0,
          totalTradeProfitPercent: 0,
          avgConfidence: 0.8,
          avgQualityScore: 0.9,
          riskElevatedDecisions: 0,
          buyDecisions: 2,
          sellDecisions: 1,
          waitDecisions: 0,
        },
        breakdown: [],
      },
      calibration: { sufficientSample: true } as any,
      governance: { auditCount: 1, readyCount: 1, blockedCount: 0, latestByStrategy: [] } as any,
      notes: [],
    } as any,
    operationalQuality: {} as any,
    portfolio: {
      available: true,
      overview: {
        version: "portfolio-governance-overview.v2",
        generatedAt: "2026-09-20T13:00:00.000Z",
        state: "ready",
        scope: { walkForwardRunId: 12, asset: "BTCUSDT", timeframe: "1h", datasetHash: "a".repeat(64) },
        portfolio: {
          allChecksPassed: true,
          foldCount: 2,
          strategies: [{ strategy: "baseline", stability: { foldCount: 2, version: "portfolio-stability.v1" } }],
        },
        diagnostics: {} as any,
        notes: [],
      } as any,
    },
    pipeline: {
      available: true,
      current: {
        version: "pipeline-audit.v1",
        generatedAt: "2026-09-20T13:00:00.000Z",
        state: "ready",
        scope: { walkForwardRunId: 12, asset: "BTCUSDT", timeframe: "1h", datasetHash: "a".repeat(64), candlesTotal: 100 },
        traceability: {
          dataset: { present: true, hash: "a".repeat(64), candlesTotal: 100 },
          oos: { auditCount: 1, latestByStrategy: [{ strategy: "baseline", id: 1, status: "ready", walkForwardRunId: 12, evidenceHash: "b".repeat(64), gateVersion: "oos-validation-gate.v1", createdAt: "2026-09-20T13:00:00.000Z" }], requiredStrategies: ["baseline"] },
          portfolio: { available: true, walkForwardRunId: 12, datasetHash: "a".repeat(64), foldCount: 2, stabilityCoveragePct: 100, contractVersion: "portfolio-governance-overview.v2" },
          product: { operationalQualityVersion: "operational-quality.v1", operationalQualityState: "ready" },
        },
        checks: [],
        blockingReasons: [],
        warnings: [],
        evidenceHash: "c".repeat(64),
        interpretation: { readyMeans: "ok", notAnInvestmentVerdict: true },
      } as any,
      history: [],
    },
    evidence: { datasetHash: "a".repeat(64), currentPipelineEvidenceHash: "c".repeat(64), oosEvidenceHashes: [], historicalPipelineEvidenceHashes: [] },
    traceability: { chain: ["dataset", "oos", "walk-forward", "portfolio", "product"], datasetLinked: true, oosLinked: true, portfolioLinked: true, productLinked: true },
    guardrails: { paperTradingOnly: true, deterministicDecisionAuthoritative: true, aiAdvisoryOnly: true, dashboardReadOnly: true },
    interpretation: { readyMeans: "ok", blockedMeans: "blocked", notAnInvestmentVerdict: true },
    notes: [],
  };
}

const settlementAudit: OutcomeSettlementAuditSummary = {
  version: "outcome-settlement-audit.v1",
  filters: { ativo: "BTCUSDT", timeframe: "1h", from: null, to: null },
  finalizedDecisions: 2,
  settledDecisions: 2,
  notApplicableDecisions: 0,
  pendingDecisions: 1,
  auditedDecisions: 2,
  coveragePct: 100,
  latestEvaluatedAt: new Date("2026-09-20T13:00:00Z"),
};

const ready = buildSystemValidationOverview({
  generatedAt: new Date("2026-09-20T13:00:00Z"),
  asset: "BTCUSDT",
  timeframe: "1h",
  fromRun: 12,
  lookbackDays: 30,
  dashboard: dashboard("ready"),
  continuousGovernance: {
    version: "continuous-governance.v1",
    generatedAt: "2026-09-20T13:00:00.000Z",
    state: "ready",
    scope: { walkForwardRunId: 12, asset: "BTCUSDT", timeframe: "1h" },
    current: { auditState: "ready", snapshotId: 1, evidenceHash: "d".repeat(64), datasetHash: "a".repeat(64), generatedAt: "2026-09-20T13:00:00.000Z" },
    baseline: null,
    regression: { detected: false, comparable: false, blockingEventCount: 0, events: [] },
    checks: { currentAuditPresent: true, snapshotPersisted: true, temporalOrderValid: true, evidenceHashesValid: true, datasetConsistency: "unknown", oosTraceability: true, contractDriftDetected: false },
    history: { count: 1, stateHistory: [], evidenceHistory: [] },
    interpretation: { readyMeans: "ok", regressionMeans: "ok", notAnInvestmentVerdict: true },
    notes: [],
  },
  researchIntelligence: null,
  settlementAudit,
});

assert.equal(ready.state, "ready");
assert.equal(ready.summary.blockingFailures, 0);
assert.match(ready.evidenceHash, /^[0-9a-f]{64}$/);
assert.equal(ready.checks.find((check) => check.key === "outcome-settlement")?.state, "ready");

const incomplete = buildSystemValidationOverview({
  generatedAt: new Date("2026-09-20T13:00:00Z"),
  asset: "BTCUSDT",
  timeframe: "1h",
  lookbackDays: 30,
  dashboard: dashboard("degraded"),
  continuousGovernance: null,
  researchIntelligence: null,
  settlementAudit: { ...settlementAudit, finalizedDecisions: 2, auditedDecisions: 1, coveragePct: 50 },
});

assert.equal(incomplete.state, "blocked");
assert.equal(incomplete.checks.find((check) => check.key === "outcome-settlement")?.state, "blocked");
assert.ok(incomplete.summary.blockingFailures >= 1);

console.log("system validation tests passed");
