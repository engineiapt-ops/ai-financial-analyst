import type { EvaluationOverview } from "./evaluationOverview.js";
import type { MarketDataQuality } from "../marketdata/quality.js";
import type { OperationalQualityOverview, OperationalQualityState } from "./operationalQuality.js";
import type { PipelineAuditOverview, PipelineRegressionReport, PipelineAuditState } from "./pipelineAudit.js";
import type { PortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";
import type { SystemReadinessOverview, ReadinessState } from "./systemReadiness.js";

export const GOVERNANCE_DASHBOARD_VERSION = "governance-dashboard.v1";

export type GovernanceDashboardState = "ready" | "degraded" | "blocked";

export interface GovernanceDashboardHistoryItem {
  snapshotId: number;
  createdAt: string;
  state: PipelineAuditState;
  evidenceHash: string;
  datasetHash: string;
  regressionFromPrevious: PipelineRegressionReport | null;
}

export interface GovernanceDashboardOverview {
  version: typeof GOVERNANCE_DASHBOARD_VERSION;
  generatedAt: string;
  state: GovernanceDashboardState;
  scope: {
    asset: string;
    timeframe: string;
    walkForwardRunId: number | null;
    lookbackDays: number;
  };
  system: SystemReadinessOverview;
  marketData: MarketDataQuality;
  evaluation: EvaluationOverview;
  operationalQuality: OperationalQualityOverview;
  portfolio: {
    available: boolean;
    overview: PortfolioGovernanceOverview | null;
  };
  pipeline: {
    available: boolean;
    current: PipelineAuditOverview | null;
    history: GovernanceDashboardHistoryItem[];
  };
  evidence: {
    datasetHash: string | null;
    currentPipelineEvidenceHash: string | null;
    oosEvidenceHashes: Array<{
      strategy: string;
      evidenceHash: string;
    }>;
    historicalPipelineEvidenceHashes: string[];
  };
  traceability: {
    chain: ["dataset", "oos", "walk-forward", "portfolio", "product"];
    datasetLinked: boolean;
    oosLinked: boolean;
    portfolioLinked: boolean;
    productLinked: boolean;
  };
  guardrails: {
    paperTradingOnly: true;
    deterministicDecisionAuthoritative: true;
    aiAdvisoryOnly: true;
    dashboardReadOnly: true;
  };
  interpretation: {
    readyMeans: string;
    blockedMeans: string;
    notAnInvestmentVerdict: true;
  };
  notes: string[];
}

function severity(state: ReadinessState | OperationalQualityState | PipelineAuditState): number {
  return state === "blocked" ? 2 : state === "degraded" ? 1 : 0;
}

function overallState(
  system: SystemReadinessOverview,
  operationalQuality: OperationalQualityOverview,
  pipelineAudit: PipelineAuditOverview | null,
): GovernanceDashboardState {
  const maxSeverity = Math.max(
    severity(system.state),
    severity(operationalQuality.state),
    pipelineAudit ? severity(pipelineAudit.state) : 0,
  );

  return maxSeverity === 2 ? "blocked" : maxSeverity === 1 ? "degraded" : "ready";
}

export function buildGovernanceDashboardOverview(input: {
  generatedAt: Date;
  asset: string;
  timeframe: string;
  lookbackDays: number;
  system: SystemReadinessOverview;
  marketData: MarketDataQuality;
  evaluation: EvaluationOverview;
  operationalQuality: OperationalQualityOverview;
  portfolio?: PortfolioGovernanceOverview | null;
  pipelineAudit?: PipelineAuditOverview | null;
  pipelineHistory?: GovernanceDashboardHistoryItem[];
}): GovernanceDashboardOverview {
  const pipelineAudit = input.pipelineAudit ?? null;
  const history = input.pipelineHistory ?? [];

  const currentOosEvidenceHashes = pipelineAudit?.traceability.oos.latestByStrategy.map((audit) => ({
    strategy: audit.strategy,
    evidenceHash: audit.evidenceHash,
  })) ?? [];

  const datasetHash =
    pipelineAudit?.scope.datasetHash ??
    input.portfolio?.scope.datasetHash ??
    null;

  return {
    version: GOVERNANCE_DASHBOARD_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    state: overallState(input.system, input.operationalQuality, pipelineAudit),
    scope: {
      asset: input.asset.toUpperCase(),
      timeframe: input.timeframe,
      walkForwardRunId: pipelineAudit?.scope.walkForwardRunId ?? input.portfolio?.scope.walkForwardRunId ?? null,
      lookbackDays: input.lookbackDays,
    },
    system: input.system,
    marketData: input.marketData,
    evaluation: input.evaluation,
    operationalQuality: input.operationalQuality,
    portfolio: {
      available: Boolean(input.portfolio),
      overview: input.portfolio ?? null,
    },
    pipeline: {
      available: Boolean(pipelineAudit),
      current: pipelineAudit,
      history,
    },
    evidence: {
      datasetHash,
      currentPipelineEvidenceHash: pipelineAudit?.evidenceHash ?? null,
      oosEvidenceHashes: currentOosEvidenceHashes,
      historicalPipelineEvidenceHashes: history.map((item) => item.evidenceHash),
    },
    traceability: {
      chain: ["dataset", "oos", "walk-forward", "portfolio", "product"],
      datasetLinked: Boolean(datasetHash),
      oosLinked: pipelineAudit ? pipelineAudit.traceability.oos.latestByStrategy.length > 0 : false,
      portfolioLinked: Boolean(input.portfolio && pipelineAudit?.traceability.portfolio.available),
      productLinked: Boolean(input.operationalQuality.version),
    },
    guardrails: {
      paperTradingOnly: true,
      deterministicDecisionAuthoritative: true,
      aiAdvisoryOnly: true,
      dashboardReadOnly: true,
    },
    interpretation: {
      readyMeans: "The operational, evaluation and traceability artifacts are available and internally aligned for the selected scope.",
      blockedMeans: "One or more governance invariants are not satisfied and require diagnosis before relying on the affected pipeline artifacts.",
      notAnInvestmentVerdict: true,
    },
    notes: [
      "This dashboard is a read-only governance cockpit.",
      "It does not select a preferred strategy or rank strategies.",
      "It does not modify thresholds, sizing, portfolio configuration or execution.",
      "Regression events describe structural changes between audit snapshots; they are not investment recommendations.",
      "External AI context remains advisory and cannot authorize execution.",
    ],
  };
}
