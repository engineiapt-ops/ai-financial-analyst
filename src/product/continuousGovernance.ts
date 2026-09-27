import type { PipelineAuditState, PipelineRegressionEvent, PipelineRegressionReport } from "./pipelineAudit.js";

export const CONTINUOUS_GOVERNANCE_VERSION = "continuous-governance.v1";

export type ContinuousGovernanceState = "ready" | "degraded" | "blocked";

export interface ContinuousGovernanceHistoryItem {
  snapshotId: number;
  createdAt: string;
  state: PipelineAuditState;
  evidenceHash: string;
  datasetHash: string;
}

export interface ContinuousGovernanceOverview {
  version: typeof CONTINUOUS_GOVERNANCE_VERSION;
  generatedAt: string;
  state: ContinuousGovernanceState;
  scope: {
    walkForwardRunId: number;
    asset: string;
    timeframe: "1h" | "4h" | "1d";
  };
  current: {
    auditState: PipelineAuditState;
    snapshotId: number;
    evidenceHash: string;
    datasetHash: string;
    generatedAt: string;
  };
  baseline: {
    snapshotId: number;
    createdAt: string;
    state: PipelineAuditState;
    evidenceHash: string;
    datasetHash: string;
  } | null;
  regression: {
    detected: boolean;
    comparable: boolean;
    blockingEventCount: number;
    events: PipelineRegressionEvent[];
  };
  checks: {
    currentAuditPresent: boolean;
    snapshotPersisted: boolean;
    temporalOrderValid: boolean;
    evidenceHashesValid: boolean;
    datasetConsistency: "same" | "changed" | "unknown";
    oosTraceability: boolean;
    contractDriftDetected: boolean;
  };
  history: {
    count: number;
    stateHistory: ContinuousGovernanceHistoryItem[];
    evidenceHistory: string[];
  };
  interpretation: {
    readyMeans: string;
    regressionMeans: string;
    notAnInvestmentVerdict: true;
  };
  notes: string[];
}

export function buildContinuousGovernanceOverview(input: {
  generatedAt: Date;
  audit: {
    state: PipelineAuditState;
    generatedAt: string;
    scope: {
      walkForwardRunId: number | null;
      asset: string | null;
      timeframe: string | null;
      datasetHash: string | null;
    };
    evidenceHash: string;
    traceability: {
      oos: {
        latestByStrategy: Array<{
          walkForwardRunId: number | null;
          evidenceHash: string;
        }>;
      };
    };
  };
  snapshot: {
    id: number;
    createdAt: Date;
    evidenceHash: string;
    datasetHash: string;
    state: PipelineAuditState;
  };
  baseline: {
    id: number;
    createdAt: Date;
    evidenceHash: string;
    datasetHash: string;
    state: PipelineAuditState;
    snapshot: typeof input.audit;
  } | null;
  regression: PipelineRegressionReport;
  history: Array<{
    id: number;
    createdAt: Date;
    state: PipelineAuditState;
    evidenceHash: string;
    datasetHash: string;
  }>;
}): ContinuousGovernanceOverview {
  const scopeRunId = input.audit.scope.walkForwardRunId;
  const asset = input.audit.scope.asset;
  const timeframe = input.audit.scope.timeframe;

  if (!scopeRunId || !asset || !timeframe || !input.audit.evidenceHash) {
    throw new Error("Continuous governance requires a complete pipeline-audit scope and evidence hash");
  }

  const chronological = [...input.history].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );

  const temporalOrderValid = input.history.every(
    (item, index) =>
      index === 0 ||
      item.createdAt.getTime() <= input.history[index - 1].createdAt.getTime(),
  );

  const evidenceHashesValid =
    chronological.length > 0 &&
    chronological.every(
      (item) =>
        /^[0-9a-f]{64}$/.test(item.evidenceHash) &&
        /^[0-9a-f]{64}$/.test(item.datasetHash),
    );

  const oosTraceability =
    input.audit.traceability.oos.latestByStrategy.length > 0 &&
    input.audit.traceability.oos.latestByStrategy.every(
      (item) =>
        item.walkForwardRunId === scopeRunId &&
        /^[0-9a-f]{64}$/.test(item.evidenceHash),
    );

  const datasetConsistency: "same" | "changed" | "unknown" =
    input.baseline === null
      ? "unknown"
      : input.baseline.datasetHash === input.snapshot.datasetHash
        ? "same"
        : "changed";

  const contractDriftDetected = input.regression.events.some(
    (event) => event.kind === "contract-drift",
  );

  const warningEvents = input.regression.events.some(
    (event) => event.severity === "warning",
  );

  const state: ContinuousGovernanceState =
    input.audit.state === "blocked" || input.regression.regressed
      ? "blocked"
      : input.audit.state === "degraded" || warningEvents
        ? "degraded"
        : "ready";

  return {
    version: CONTINUOUS_GOVERNANCE_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    state,
    scope: {
      walkForwardRunId: scopeRunId,
      asset: asset.toUpperCase(),
      timeframe: timeframe as "1h" | "4h" | "1d",
    },
    current: {
      auditState: input.audit.state,
      snapshotId: input.snapshot.id,
      evidenceHash: input.snapshot.evidenceHash,
      datasetHash: input.snapshot.datasetHash,
      generatedAt: input.audit.generatedAt,
    },
    baseline: input.baseline
      ? {
          snapshotId: input.baseline.id,
          createdAt: input.baseline.createdAt.toISOString(),
          state: input.baseline.state,
          evidenceHash: input.baseline.evidenceHash,
          datasetHash: input.baseline.datasetHash,
        }
      : null,
    regression: {
      detected: input.regression.regressed,
      comparable: input.regression.comparable,
      blockingEventCount: input.regression.events.filter(
        (event) => event.severity === "blocking",
      ).length,
      events: input.regression.events,
    },
    checks: {
      currentAuditPresent: true,
      snapshotPersisted: input.snapshot.evidenceHash === input.audit.evidenceHash,
      temporalOrderValid,
      evidenceHashesValid,
      datasetConsistency,
      oosTraceability,
      contractDriftDetected,
    },
    history: {
      count: chronological.length,
      stateHistory: chronological.map((item) => ({
        snapshotId: item.id,
        createdAt: item.createdAt.toISOString(),
        state: item.state,
        evidenceHash: item.evidenceHash,
        datasetHash: item.datasetHash,
      })),
      evidenceHistory: chronological.map((item) => item.evidenceHash),
    },
    interpretation: {
      readyMeans: "The current governance artifacts are persisted, temporally ordered and traceable against the selected walk-forward scope.",
      regressionMeans: "A regression event identifies structural change between governance snapshots and requires diagnosis of the affected artifact chain.",
      notAnInvestmentVerdict: true,
    },
    notes: [
      "This contract is a governance/traceability check and is read-only with respect to trading behavior.",
      "The explicit check endpoint may persist an immutable pipeline-audit snapshot; it does not modify signals or execution rules.",
      "Dataset changes are tracked as scope changes and are not treated as trading-performance verdicts.",
      "No strategy ranking or preferred-strategy selection is produced.",
    ],
  };
}
