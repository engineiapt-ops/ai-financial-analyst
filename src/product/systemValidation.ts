import { createHash } from "node:crypto";
import type { ContinuousGovernanceOverview } from "./continuousGovernance.js";
import type { GovernanceDashboardOverview } from "./governanceDashboard.js";
import type { ResearchIntelligenceOverview } from "../research/researchIntelligence.js";
import type { OutcomeSettlementAuditSummary } from "../db/repository.js";

export const SYSTEM_VALIDATION_VERSION = "system-validation.v1";

export type SystemValidationState = "ready" | "degraded" | "blocked";

export interface SystemValidationCheck {
  key:
    | "system-readiness"
    | "market-data"
    | "decision-evaluation"
    | "oos-governance"
    | "portfolio-integrity"
    | "pipeline-audit"
    | "continuous-governance"
    | "research-intelligence"
    | "outcome-settlement";
  state: SystemValidationState;
  blocking: boolean;
  available: boolean;
  contractVersion: string | null;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface SystemValidationOverview {
  version: typeof SYSTEM_VALIDATION_VERSION;
  generatedAt: string;
  state: SystemValidationState;
  scope: {
    asset: string;
    timeframe: "1h" | "4h" | "1d";
    fromRun: number | null;
    lookbackDays: number;
  };
  summary: {
    readyCount: number;
    degradedCount: number;
    blockedCount: number;
    blockingFailures: number;
  };
  checks: SystemValidationCheck[];
  contracts: string[];
  evidenceHash: string;
  interpretation: {
    readyMeans: string;
    blockedMeans: string;
    notAnInvestmentVerdict: true;
  };
  notes: string[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((item) => stableJson(item)).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item))
        .join(",") +
      "}";
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function summarizeState(checks: SystemValidationCheck[]): SystemValidationState {
  if (checks.some((check) => check.blocking && check.state === "blocked")) {
    return "blocked";
  }
  if (checks.some((check) => check.state !== "ready")) {
    return "degraded";
  }
  return "ready";
}

export function buildSystemValidationOverview(input: {
  generatedAt: Date;
  asset: string;
  timeframe: "1h" | "4h" | "1d";
  fromRun?: number;
  lookbackDays: number;
  dashboard: GovernanceDashboardOverview;
  continuousGovernance?: ContinuousGovernanceOverview | null;
  researchIntelligence?: ResearchIntelligenceOverview | null;
  settlementAudit: OutcomeSettlementAuditSummary;
}): SystemValidationOverview {
  const checks: SystemValidationCheck[] = [];
  const add = (check: SystemValidationCheck) => checks.push(check);

  const readiness = input.dashboard.system;
  add({
    key: "system-readiness",
    state: readiness.state,
    blocking: true,
    available: true,
    contractVersion: readiness.version,
    detail: readiness.checks.configuration.detail,
    evidence: {
      authentication: readiness.checks.authentication.state,
      database: readiness.checks.database.state,
      execution: readiness.checks.execution.state,
      governance: readiness.checks.governance.state,
    },
  });

  add({
    key: "market-data",
    state: input.dashboard.marketData.status === "fresh" ? "ready" : "blocked",
    blocking: true,
    available: true,
    contractVersion: input.dashboard.marketData.version,
    detail:
      input.dashboard.marketData.status === "fresh"
        ? "Latest market data is within the configured freshness window."
        : "Latest market data is stale.",
    evidence: {
      status: input.dashboard.marketData.status,
      dataAsOf: input.dashboard.marketData.dataAsOf,
      ageMs: input.dashboard.marketData.ageMs,
      maxAgeMs: input.dashboard.marketData.maxAgeMs,
    },
  });

  const decisionSummary =
    (input.dashboard.evaluation as any).decisionQuality ??
    (input.dashboard.evaluation as any).kpis?.summary ?? {
      totalDecisions: 0,
      settledDecisions: 0,
      pendingDecisions: 0,
      notApplicableDecisions: 0,
    };
  const evaluationState: SystemValidationState =
    decisionSummary.totalDecisions === 0
      ? "degraded"
      : "ready";

  add({
    key: "decision-evaluation",
    state: evaluationState,
    blocking: false,
    available: decisionSummary.totalDecisions > 0,
    contractVersion: input.dashboard.evaluation.version,
    detail:
      decisionSummary.totalDecisions > 0
        ? "Decision evaluation has persisted observations for the selected scope."
        : "No persisted decision evaluations exist for the selected scope.",
    evidence: {
      totalDecisions: decisionSummary.totalDecisions,
      settledDecisions: decisionSummary.settledDecisions,
      pendingDecisions: decisionSummary.pendingDecisions,
      notApplicableDecisions: decisionSummary.notApplicableDecisions ?? 0,
    },
  });

  const hasRun = input.fromRun !== undefined;
  const pipeline = input.dashboard.pipeline.current;
  const oosBlocked =
    hasRun && pipeline ? pipeline.state === "blocked" : false;
  const oosAvailable =
    hasRun && pipeline ? pipeline.traceability.oos.auditCount > 0 : false;
  add({
    key: "oos-governance",
    state: !hasRun
      ? "degraded"
      : oosBlocked
        ? "blocked"
        : oosAvailable
          ? "ready"
          : "degraded",
    blocking: hasRun,
    available: oosAvailable,
    contractVersion: pipeline?.version ?? null,
    detail: !hasRun
      ? "A walk-forward run was not supplied; OOS validation is outside the requested validation scope."
      : oosBlocked
        ? "Pipeline audit is blocked for the selected walk-forward run."
        : oosAvailable
          ? "Latest OOS governance evidence is linked to the selected walk-forward run."
          : "No OOS governance evidence is available for the selected walk-forward run.",
    evidence: {
      auditCount: pipeline?.traceability.oos.auditCount ?? 0,
      latestByStrategy: pipeline?.traceability.oos.latestByStrategy ?? [],
    },
  });

  const portfolio = input.dashboard.portfolio.overview;
  const portfolioReady = Boolean(
    portfolio &&
    portfolio.portfolio.allChecksPassed &&
    (portfolio.portfolio.strategies.length === 0 ||
      portfolio.portfolio.strategies.every(
        (strategy) => strategy.stability.foldCount >= portfolio.portfolio.foldCount,
      )),
  );
  add({
    key: "portfolio-integrity",
    state: !hasRun
      ? "degraded"
      : !portfolio
        ? "blocked"
        : portfolioReady
          ? "ready"
          : "blocked",
    blocking: hasRun,
    available: Boolean(portfolio),
    contractVersion: portfolio?.version ?? null,
    detail: !hasRun
      ? "A walk-forward run was not supplied; portfolio governance is outside the requested validation scope."
      : !portfolio
        ? "Portfolio governance is unavailable for the selected walk-forward run."
        : portfolioReady
          ? "Persisted portfolio integrity and stability coverage are complete."
          : "Portfolio integrity or stability coverage is incomplete.",
    evidence: {
      available: Boolean(portfolio),
      allChecksPassed: portfolio?.portfolio.allChecksPassed ?? null,
      foldCount: portfolio?.portfolio.foldCount ?? 0,
    },
  });

  add({
    key: "pipeline-audit",
    state: !hasRun
      ? "degraded"
      : pipeline?.state === "blocked"
        ? "blocked"
        : pipeline
          ? "ready"
          : "blocked",
    blocking: hasRun,
    available: Boolean(pipeline),
    contractVersion: pipeline?.version ?? null,
    detail: !hasRun
      ? "A walk-forward run was not supplied; pipeline audit is outside the requested validation scope."
      : pipeline
        ? "Pipeline audit contract is available for the selected walk-forward run."
        : "Pipeline audit contract is unavailable.",
    evidence: {
      evidenceHash: pipeline?.evidenceHash ?? null,
      state: pipeline?.state ?? null,
    },
  });

  const continuous = input.continuousGovernance;
  add({
    key: "continuous-governance",
    state: !hasRun
      ? "degraded"
      : !continuous
        ? "blocked"
        : continuous.state,
    blocking: hasRun,
    available: Boolean(continuous),
    contractVersion: continuous?.version ?? null,
    detail: !hasRun
      ? "A walk-forward run was not supplied; continuous governance is outside the requested validation scope."
      : continuous
        ? continuous.state === "ready"
          ? "Continuous governance found no blocking structural regression."
          : "Continuous governance reported degraded or blocked structural evidence."
        : "Continuous governance contract is unavailable.",
    evidence: {
      regressionDetected: continuous?.regression.detected ?? false,
      blockingEventCount: continuous?.regression.blockingEventCount ?? 0,
      temporalOrderValid: continuous?.checks.temporalOrderValid ?? false,
      evidenceHashesValid: continuous?.checks.evidenceHashesValid ?? false,
    },
  });

  const research = input.researchIntelligence;
  const researchState = !research
    ? "ready"
    : research.quality.state;
  add({
    key: "research-intelligence",
    state: researchState,
    blocking: Boolean(research && research.quality.state === "blocked"),
    available: Boolean(research),
    contractVersion: research?.version ?? null,
    detail: research
      ? "Latest persisted research intelligence snapshot was validated for traceability and point-in-time integrity."
      : "No persisted research intelligence snapshot is available for the selected scope.",
    evidence: {
      state: research?.quality.state ?? null,
      snapshotId: research?.snapshot.snapshotId ?? null,
      traceableCount: research?.evidence.traceableCount ?? 0,
      pointInTimeValidCount: research?.evidence.pointInTimeValidCount ?? 0,
      totalCount: research?.evidence.totalCount ?? 0,
    },
  });

  const settlement = input.settlementAudit;
  const settlementState: SystemValidationState =
    settlement.finalizedDecisions === 0
      ? "degraded"
      : settlement.coveragePct === 100
        ? "ready"
        : "blocked";
  add({
    key: "outcome-settlement",
    state: settlementState,
    blocking: settlement.finalizedDecisions > 0,
    available: settlement.finalizedDecisions > 0,
    contractVersion: settlement.version,
    detail:
      settlement.finalizedDecisions === 0
        ? "No finalized decision outcomes exist yet in the selected scope."
        : settlement.coveragePct === 100
          ? "Every finalized decision outcome has an immutable settlement audit."
          : "At least one finalized decision outcome is missing an immutable settlement audit.",
    evidence: {
      finalizedDecisions: settlement.finalizedDecisions,
      pendingDecisions: settlement.pendingDecisions,
      auditedDecisions: settlement.auditedDecisions,
      coveragePct: settlement.coveragePct,
      latestEvaluatedAt: settlement.latestEvaluatedAt,
    },
  });

  const state = summarizeState(checks);
  const readyCount = checks.filter((check) => check.state === "ready").length;
  const degradedCount = checks.filter((check) => check.state === "degraded").length;
  const blockedCount = checks.filter((check) => check.state === "blocked").length;
  const blockingFailures = checks.filter(
    (check) => check.blocking && check.state === "blocked",
  ).length;

  const contracts = [
    SYSTEM_VALIDATION_VERSION,
    ...checks
      .map((check) => check.contractVersion)
      .filter((version): version is string => Boolean(version)),
  ].sort();

  const evidenceHash = sha256({
    version: SYSTEM_VALIDATION_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    scope: {
      asset: input.asset.toUpperCase(),
      timeframe: input.timeframe,
      fromRun: input.fromRun ?? null,
      lookbackDays: input.lookbackDays,
    },
    state,
    checks: checks.map((check) => ({
      key: check.key,
      state: check.state,
      blocking: check.blocking,
      available: check.available,
      contractVersion: check.contractVersion,
      detail: check.detail,
      evidence: check.evidence ?? null,
    })),
  });

  return {
    version: SYSTEM_VALIDATION_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    state,
    scope: {
      asset: input.asset.toUpperCase(),
      timeframe: input.timeframe,
      fromRun: input.fromRun ?? null,
      lookbackDays: input.lookbackDays,
    },
    summary: {
      readyCount,
      degradedCount,
      blockedCount,
      blockingFailures,
    },
    checks,
    contracts,
    evidenceHash,
    interpretation: {
      readyMeans:
        "All critical validation contracts are present and satisfy their operational invariants for the selected scope.",
      blockedMeans:
        "At least one critical operational invariant is not satisfied; the state is not a trading or investment verdict.",
      notAnInvestmentVerdict: true,
    },
    notes: [
      "This contract is an operational release-readiness check.",
      "It does not create a trading signal.",
      "It does not modify thresholds, sizing, strategies or execution rules.",
      "External research and Gemini remain contextual/advisory.",
      "Outcome settlement audit coverage measures traceability, not investment performance.",
    ],
  };
}
