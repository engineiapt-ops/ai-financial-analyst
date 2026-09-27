import { strict as assert } from "node:assert";
import {
  buildContinuousGovernanceOverview,
  CONTINUOUS_GOVERNANCE_VERSION,
} from "./continuousGovernance.js";
import type { PipelineAuditOverview } from "./pipelineAudit.js";

const audit = {
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
} as unknown as PipelineAuditOverview;

const baselineSnapshot = {
  id: 1,
  createdAt: new Date("2026-09-27T09:00:00.000Z"),
  evidenceHash: "d".repeat(64),
  datasetHash: "a".repeat(64),
  state: "ready" as const,
  snapshot: {
    ...audit,
    generatedAt: "2026-09-27T09:00:00.000Z",
    evidenceHash: "d".repeat(64),
  },
};

const currentSnapshot = {
  id: 2,
  createdAt: new Date("2026-09-27T10:00:00.000Z"),
  evidenceHash: "c".repeat(64),
  datasetHash: "a".repeat(64),
  state: "ready" as const,
};

const ready = buildContinuousGovernanceOverview({
  generatedAt: new Date("2026-09-27T10:00:00.000Z"),
  audit,
  snapshot: currentSnapshot,
  baseline: baselineSnapshot,
  regression: {
    comparable: true,
    regressed: false,
    events: [],
  },
  history: [baselineSnapshot, currentSnapshot],
});

assert.equal(ready.version, CONTINUOUS_GOVERNANCE_VERSION);
assert.equal(ready.state, "ready");
assert.equal(ready.regression.detected, false);
assert.equal(ready.checks.datasetConsistency, "same");
assert.equal(ready.checks.oosTraceability, true);
assert.equal(ready.checks.evidenceHashesValid, true);
assert.equal(ready.history.count, 2);
assert.deepEqual(ready.history.evidenceHistory, ["d".repeat(64), "c".repeat(64)]);

const blockedRegression = buildContinuousGovernanceOverview({
  generatedAt: new Date("2026-09-27T11:00:00.000Z"),
  audit: {
    ...audit,
    state: "blocked",
    generatedAt: "2026-09-27T11:00:00.000Z",
  },
  snapshot: {
    ...currentSnapshot,
    id: 3,
    createdAt: new Date("2026-09-27T11:00:00.000Z"),
  },
  baseline: baselineSnapshot,
  regression: {
    comparable: true,
    regressed: true,
    events: [{
      kind: "oos-status-regression",
      severity: "blocking",
      strategy: "baseline",
      message: "OOS governance regressed.",
    }],
  },
  history: [baselineSnapshot, currentSnapshot],
});

assert.equal(blockedRegression.state, "blocked");
assert.equal(blockedRegression.regression.blockingEventCount, 1);
assert.equal(blockedRegression.checks.contractDriftDetected, false);

const changedDataset = buildContinuousGovernanceOverview({
  generatedAt: new Date("2026-09-27T12:00:00.000Z"),
  audit,
  snapshot: {
    ...currentSnapshot,
    datasetHash: "e".repeat(64),
  },
  baseline: baselineSnapshot,
  regression: {
    comparable: true,
    regressed: false,
    events: [{
      kind: "scope-change",
      severity: "info",
      message: "Dataset scope changed.",
    }],
  },
  history: [baselineSnapshot, {
    ...currentSnapshot,
    datasetHash: "e".repeat(64),
  }],
});

assert.equal(changedDataset.checks.datasetConsistency, "changed");
assert.equal(changedDataset.state, "ready");

console.log("continuous governance tests passed");
