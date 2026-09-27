import { strict as assert } from "node:assert";
import {
  buildPortfolioGovernanceOverview,
  PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION,
} from "./portfolioGovernanceOverview.js";

const overview = buildPortfolioGovernanceOverview({
  generatedAt: new Date("2026-09-26T17:30:00.000Z"),
  portfolioReport: {
    scope: {
      walkForwardRunId: 41,
      asset: "BTCUSDT",
      timeframe: "1h",
      candlesTotal: 1000,
      datasetHash: "dataset-hash",
    },
    strategies: [
      {
        strategy: "baseline",
        portfolioModelVersion: "portfolio-v1",
        finalEquity: 1025,
        totalReturnPct: 2.5,
        cagrPct: 5,
        maxDrawdownPct: 4,
        sharpe: 0.8,
        sortino: 1.1,
        totalSignals: 100,
        executedTrades: 80,
        rejectedTrades: 20,
        riskGateBlocks: 0,
        checks: {
          exposureConstraint: { passed: true, maxAllowedOpenPositions: 10, observedMaxOpenPositions: 4 },
          finiteCapital: true,
          signalsConsistent: true,
        },
        stability: {
          version: "portfolio-stability.v1",
          foldCount: 5,
          positiveReturnFoldCount: 3,
          positiveReturnFoldPct: 60,
          nonNegativeReturnFoldPct: 80,
          returnMeanPct: 2.2,
          returnMedianPct: 2,
          returnStdDevPct: 2.56,
          bestFoldReturnPct: 6,
          worstFoldReturnPct: -1,
          drawdownMeanPct: 3,
          drawdownMedianPct: 3,
          drawdownStdDevPct: 1.41,
          worstDrawdownPct: 5,
          medianSharpe: 0.65,
          medianSortino: 0.9,
          closedTradesTotal: 50,
          closedTradesMedian: 10,
        },
      },
      {
        strategy: "baseline_risk",
        portfolioModelVersion: "portfolio-v1-risk-regime-v1",
        finalEquity: 1018,
        totalReturnPct: 1.8,
        cagrPct: 3.5,
        maxDrawdownPct: 3.1,
        sharpe: 0.7,
        sortino: 0.9,
        totalSignals: 100,
        executedTrades: 70,
        rejectedTrades: 30,
        riskGateBlocks: 12,
        checks: {
          exposureConstraint: { passed: true, maxAllowedOpenPositions: 10, observedMaxOpenPositions: 3 },
          finiteCapital: true,
          signalsConsistent: true,
        },
        stability: {
          version: "portfolio-stability.v1",
          foldCount: 5,
          positiveReturnFoldCount: 3,
          positiveReturnFoldPct: 60,
          nonNegativeReturnFoldPct: 80,
          returnMeanPct: 2.2,
          returnMedianPct: 2,
          returnStdDevPct: 2.56,
          bestFoldReturnPct: 6,
          worstFoldReturnPct: -1,
          drawdownMeanPct: 3,
          drawdownMedianPct: 3,
          drawdownStdDevPct: 1.41,
          worstDrawdownPct: 5,
          medianSharpe: 0.65,
          medianSortino: 0.9,
          closedTradesTotal: 50,
          closedTradesMedian: 10,
        },
      },
    ],
    diagnostics: {
      totalRiskGateBlocks: 12,
      foldsWithPositiveRiskReturnDelta: 3,
      foldsWithLowerRiskDrawdown: 4,
      foldCount: 5,
    },
    folds: [{}, {}, {}, {}, {}],
    checks: [{ passed: true }, { passed: true }, { passed: true }, { passed: true }, { passed: true }],
    notes: ["Returns are account-level finite-capital portfolio results."],
  },
  regimeDiagnostics: {
    diagnostics: {
      totalSignals: 100,
      totalRiskGateBlocks: 12,
      blockedSignalWinRatePct: 25,
      blockedSignalLossRatePct: 50,
    },
    folds: [{}, {}, {}, {}, {}],
    byTrend: [{ regime: "up" }],
    byVolatility: [{ regime: "high" }],
    byMomentum: [{ regime: "positive" }],
    byCombinedRegime: [{ regime: "up-high-positive" }],
    notes: ["The diagnostic does not change any trading rule or optimize parameters."],
  },
});

assert.equal(overview.version, PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION);
assert.equal(overview.scope.walkForwardRunId, 41);
assert.equal(overview.portfolio.strategyCount, 2);
assert.equal(overview.portfolio.foldCount, 5);
assert.equal(overview.portfolio.checksPassed, 5);
assert.equal(overview.portfolio.allChecksPassed, true);
assert.equal(overview.regimes.totalRiskGateBlocks, 12);
assert.equal(overview.regimes.foldCount, 5);
assert.equal(overview.regimes.byTrend.length, 1);
assert.equal(overview.portfolio.strategies[0].stability.foldCount, 5);
assert.equal(overview.portfolio.strategies[0].stability.positiveReturnFoldPct, 60);
assert.equal(
  overview.notes.some((note) => note.includes("does not select a preferred strategy")),
  true,
);

console.log("portfolio governance overview tests passed");
