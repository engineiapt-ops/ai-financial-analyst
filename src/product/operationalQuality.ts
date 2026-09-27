import type { EvaluationOverview } from "./evaluationOverview.js";
import type { PortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";
import type { SystemReadinessOverview } from "./systemReadiness.js";
import type { MarketDataQuality } from "../marketdata/quality.js";

export const OPERATIONAL_QUALITY_VERSION = "operational-quality.v1";

export type OperationalQualityState = "ready" | "degraded" | "blocked";

export interface OperationalQualityOverview {
  version: typeof OPERATIONAL_QUALITY_VERSION;
  generatedAt: string;
  state: OperationalQualityState;
  scope: {
    asset: string;
    timeframe: string;
    portfolioRunId: number | null;
  };
  checks: {
    system: {
      state: OperationalQualityState;
      readinessState: SystemReadinessOverview["state"];
    };
    marketData: {
      state: OperationalQualityState;
      status: MarketDataQuality["status"];
      ageMs: number;
      maxAgeMs: number;
      dataAsOf: string;
    };
    quantitativeGovernance: {
      state: OperationalQualityState;
      calibrationSufficient: boolean;
      auditCount: number;
      readyAuditCount: number;
      blockedAuditCount: number;
    };
    portfolio: {
      state: OperationalQualityState;
      available: boolean;
      allChecksPassed: boolean | null;
      foldCount: number;
      stabilityCoveragePct: number | null;
    };
    executionInvariant: {
      state: "ready" | "blocked";
      paperTradingOnly: boolean;
    };
  };
  contracts: {
    systemReadiness: string;
    marketDataQuality: string;
    evaluationOverview: string | null;
    portfolioGovernance: string | null;
  };
  notes: string[];
}

export function buildOperationalQualityOverview(input: {
  generatedAt: Date;
  asset: string;
  timeframe: string;
  portfolioRunId?: number;
  readiness: SystemReadinessOverview;
  marketData: MarketDataQuality;
  evaluation: EvaluationOverview;
  portfolio?: PortfolioGovernanceOverview;
}): OperationalQualityOverview {
  const hasPortfolio = Boolean(input.portfolio);
  const portfolioFoldCount = input.portfolio?.portfolio.foldCount ?? 0;
  const stabilityValues = input.portfolio?.portfolio.strategies.map(
    (strategy) => strategy.stability.foldCount,
  ) ?? [];
  const stabilityCoveragePct =
    stabilityValues.length > 0 && portfolioFoldCount > 0
      ? (Math.min(...stabilityValues) / portfolioFoldCount) * 100
      : null;

  const marketState: OperationalQualityState =
    input.marketData.status === "fresh" ? "ready" : "blocked";

  const latestBlockedAudit = input.evaluation.governance.latestByStrategy.some(
    (audit) => audit.status === "blocked",
  );

  const quantitativeState: OperationalQualityState =
    latestBlockedAudit
      ? "blocked"
      : !input.evaluation.calibration.sufficientSample ||
          input.evaluation.governance.auditCount === 0
        ? "degraded"
        : "ready";

  const portfolioState: OperationalQualityState =
    !hasPortfolio
      ? "degraded"
      : input.portfolio!.portfolio.allChecksPassed &&
          (stabilityCoveragePct === null || stabilityCoveragePct >= 100)
        ? "ready"
        : "degraded";

  const systemState: OperationalQualityState = input.readiness.state;

  const executionState: "ready" | "blocked" =
    input.readiness.checks.execution.paperTradingOnly &&
    input.readiness.checks.execution.state === "ready"
      ? "ready"
      : "blocked";

  const state: OperationalQualityState =
    marketState === "blocked" ||
    systemState === "blocked" ||
    quantitativeState === "blocked" ||
    executionState === "blocked"
      ? "blocked"
      : systemState === "ready" &&
          marketState === "ready" &&
          quantitativeState === "ready" &&
          portfolioState === "ready"
        ? "ready"
        : "degraded";

  return {
    version: OPERATIONAL_QUALITY_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    state,
    scope: {
      asset: input.asset.toUpperCase(),
      timeframe: input.timeframe,
      portfolioRunId: input.portfolioRunId ?? null,
    },
    checks: {
      system: {
        state: systemState,
        readinessState: input.readiness.state,
      },
      marketData: {
        state: marketState,
        status: input.marketData.status,
        ageMs: input.marketData.ageMs,
        maxAgeMs: input.marketData.maxAgeMs,
        dataAsOf: input.marketData.dataAsOf,
      },
      quantitativeGovernance: {
        state: quantitativeState,
        calibrationSufficient: input.evaluation.calibration.sufficientSample,
        auditCount: input.evaluation.governance.auditCount,
        readyAuditCount: input.evaluation.governance.readyCount,
        blockedAuditCount: input.evaluation.governance.blockedCount,
      },
      portfolio: {
        state: portfolioState,
        available: hasPortfolio,
        allChecksPassed: input.portfolio?.portfolio.allChecksPassed ?? null,
        foldCount: portfolioFoldCount,
        stabilityCoveragePct,
      },
      executionInvariant: {
        state: executionState,
        paperTradingOnly: input.readiness.checks.execution.paperTradingOnly,
      },
    },
    contracts: {
      systemReadiness: input.readiness.version,
      marketDataQuality: input.marketData.version,
      evaluationOverview: input.evaluation.version,
      portfolioGovernance: input.portfolio?.version ?? null,
    },
    notes: [
      "This contract is operational/governance-only.",
      "It does not produce or modify a trading signal.",
      "The deterministic decision engine remains authoritative.",
      "External AI context remains advisory and cannot authorize execution.",
      "A blocked state means an operational invariant is not satisfied; it is not an investment verdict.",
    ],
  };
}
