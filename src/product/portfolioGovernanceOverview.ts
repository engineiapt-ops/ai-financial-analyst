export const PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION =
  "portfolio-governance-overview.v1";

export interface PortfolioGovernanceOverview {
  version: typeof PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION;
  generatedAt: string;
  scope: {
    walkForwardRunId: number;
    asset: string;
    timeframe: string;
    candlesTotal: number;
    datasetHash: string;
  };
  portfolio: {
    strategyCount: number;
    foldCount: number;
    allChecksPassed: boolean;
    checksPassed: number;
    checksTotal: number;
    diagnostics: {
      totalRiskGateBlocks: number;
      foldsWithPositiveRiskReturnDelta: number;
      foldsWithLowerRiskDrawdown: number;
      foldCount: number;
    };
    strategies: Array<{
      strategy: string;
      portfolioModelVersion: string;
      finalEquity: number | null;
      totalReturnPct: number | null;
      cagrPct: number | null;
      maxDrawdownPct: number | null;
      sharpe: number | null;
      sortino: number | null;
      totalSignals: number;
      executedTrades: number;
      rejectedTrades: number;
      riskGateBlocks: number;
      checks: {
        exposureConstraint: {
          passed: boolean;
          maxAllowedOpenPositions: number;
          observedMaxOpenPositions: number;
        };
        finiteCapital: boolean;
        signalsConsistent: boolean;
      };
    }>;
  };
  regimes: {
    totalSignals: number;
    totalRiskGateBlocks: number;
    blockedSignalWinRatePct: number | null;
    blockedSignalLossRatePct: number | null;
    foldCount: number;
    byTrend: unknown[];
    byVolatility: unknown[];
    byMomentum: unknown[];
    byCombinedRegime: unknown[];
  };
  notes: string[];
}

export function buildPortfolioGovernanceOverview(input: {
  generatedAt: Date;
  portfolioReport: {
    scope: PortfolioGovernanceOverview["scope"];
    strategies: PortfolioGovernanceOverview["portfolio"]["strategies"];
    diagnostics: PortfolioGovernanceOverview["portfolio"]["diagnostics"];
    folds: unknown[];
    checks: Array<{ passed: boolean }>;
    notes: string[];
  };
  regimeDiagnostics: {
    diagnostics: PortfolioGovernanceOverview["regimes"];
    byTrend: unknown[];
    byVolatility: unknown[];
    byMomentum: unknown[];
    byCombinedRegime: unknown[];
    folds: unknown[];
    notes?: string[];
  };
}): PortfolioGovernanceOverview {
  const checksPassed = input.portfolioReport.checks.filter((check) => check.passed).length;
  const checksTotal = input.portfolioReport.checks.length;

  return {
    version: PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    scope: input.portfolioReport.scope,
    portfolio: {
      strategyCount: input.portfolioReport.strategies.length,
      foldCount: input.portfolioReport.folds.length,
      allChecksPassed: checksTotal > 0 && checksPassed === checksTotal,
      checksPassed,
      checksTotal,
      diagnostics: input.portfolioReport.diagnostics,
      strategies: input.portfolioReport.strategies,
    },
    regimes: {
      totalSignals: input.regimeDiagnostics.diagnostics.totalSignals,
      totalRiskGateBlocks: input.regimeDiagnostics.diagnostics.totalRiskGateBlocks,
      blockedSignalWinRatePct: input.regimeDiagnostics.diagnostics.blockedSignalWinRatePct,
      blockedSignalLossRatePct: input.regimeDiagnostics.diagnostics.blockedSignalLossRatePct,
      foldCount: input.regimeDiagnostics.folds.length,
      byTrend: input.regimeDiagnostics.byTrend,
      byVolatility: input.regimeDiagnostics.byVolatility,
      byMomentum: input.regimeDiagnostics.byMomentum,
      byCombinedRegime: input.regimeDiagnostics.byCombinedRegime,
    },
    notes: [
      "This contract is diagnostic/governance-only.",
      "It does not select a preferred strategy.",
      "It does not alter trading rules, thresholds, sizing or order execution.",
      ...input.portfolioReport.notes.filter((note) => !note.includes("does not select a preferred strategy.")),
      ...(input.regimeDiagnostics.notes ?? []),
    ],
  };
}
