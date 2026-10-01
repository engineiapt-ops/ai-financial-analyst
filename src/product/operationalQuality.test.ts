import type { PortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";
import { strict as assert } from "node:assert";
import {
  buildOperationalQualityOverview,
  OPERATIONAL_QUALITY_VERSION,
} from "./operationalQuality.js";

const readiness = {
  version: "system-readiness.v1" as const,
  generatedAt: "2026-09-27T10:00:00.000Z",
  state: "ready" as const,
  checks: {
    api: { state: "ready" as const, detail: "ok" },
    authentication: { state: "ready" as const, configured: true, detail: "ok" },
    configuration: {
      state: "ready" as const,
      productionMode: true,
      configured: ["DATABASE_URL", "API_AUTH_TOKEN"],
      missing: [],
      invalid: [],
      warnings: [],
      detail: "ok",
    },
    marketData: { state: "ready" as const, detail: "ok" },
    database: { state: "ready" as const, detail: "ok" },
    aiProviders: { state: "ready" as const, configured: ["none"], detail: "ok" },
    execution: { state: "ready" as const, paperTradingOnly: true, detail: "paper only" },
    governance: {
      state: "ready" as const,
      contracts: ["evaluation-overview.v1", "portfolio-governance-overview.v2"],
      detail: "ok",
    },
  },
  notes: [],
};

const marketData = {
  version: "market-data-quality.v1" as const,
  status: "fresh" as const,
  timeframe: "1h" as const,
  checkedAt: "2026-09-27T10:00:00.000Z",
  dataAsOf: "2026-09-27T09:55:00.000Z",
  ageMs: 300000,
  maxAgeMs: 5400000,
};

const evaluation = {
  version: "evaluation-overview.v1" as const,
  generatedAt: "2026-09-27T10:00:00.000Z",
  period: { from: "2026-09-26T10:00:00.000Z", to: "2026-09-27T10:00:00.000Z" },
  filters: { ativo: "BTCUSDT", timeframe: "1h" },
  decisionQuality: {
    totalDecisions: 100,
    settledDecisions: 90,
    pendingDecisions: 10,
    winRate: 55,
    avgForwardReturnPercent: 0.2,
    avgTradeProfitPercent: 0.15,
    totalTradeProfitPercent: 13.5,
    avgConfidence: 0.62,
    avgQualityScore: 0.7,
  },
  calibration: {
    sampleCount: 90,
    sufficientSample: true,
    brierScore: 0.19,
    expectedCalibrationError: 0.07,
    directionalProbability: {
      sampleCount: 90,
      sufficientSample: true,
      brierScore: 0.21,
      expectedCalibrationError: 0.08,
    },
  },
  governance: {
    auditCount: 2,
    latestByStrategy: [],
    readyCount: 2,
    blockedCount: 0,
  },
};

const portfolio = {
  version: "portfolio-governance-overview.v2" as const,
  generatedAt: "2026-09-27T10:00:00.000Z",
  scope: { walkForwardRunId: 41, asset: "BTCUSDT", timeframe: "1h", candlesTotal: 1000, datasetHash: "hash" },
  portfolio: {
    strategyCount: 2,
    foldCount: 5,
    allChecksPassed: true,
    checksPassed: 5,
    checksTotal: 5,
    diagnostics: { totalRiskGateBlocks: 1, foldsWithPositiveRiskReturnDelta: 2, foldsWithLowerRiskDrawdown: 3, foldCount: 5 },
    strategies: [
      {
        strategy: "baseline",
        portfolioModelVersion: "portfolio-v1",
        finalEquity: 1005,
        totalReturnPct: 0.5,
        cagrPct: 1,
        maxDrawdownPct: 2,
        sharpe: 0.5,
        sortino: 0.8,
        totalSignals: 100,
        executedTrades: 80,
        rejectedTrades: 20,
        riskGateBlocks: 0,
        checks: { exposureConstraint: { passed: true, maxAllowedOpenPositions: 10, observedMaxOpenPositions: 4 }, finiteCapital: true, signalsConsistent: true },
        stability: { version: "portfolio-stability.v1", foldCount: 5, positiveReturnFoldCount: 3, positiveReturnFoldPct: 60, nonNegativeReturnFoldPct: 80, returnMeanPct: 0.5, returnMedianPct: 0.5, returnStdDevPct: 0.4, bestFoldReturnPct: 1.2, worstFoldReturnPct: -0.2, drawdownMeanPct: 1.5, drawdownMedianPct: 1.4, drawdownStdDevPct: 0.5, worstDrawdownPct: 2, medianSharpe: 0.5, medianSortino: 0.8, closedTradesTotal: 50, closedTradesMedian: 10 },
      },
    ],
  },
  regimes: { totalSignals: 100, totalRiskGateBlocks: 1, blockedSignalWinRatePct: 20, blockedSignalLossRatePct: 60, foldCount: 5, byTrend: [], byVolatility: [], byMomentum: [], byCombinedRegime: [] },
  notes: [],
} as unknown as PortfolioGovernanceOverview;

const ready = buildOperationalQualityOverview({
  generatedAt: new Date("2026-09-27T10:00:00.000Z"),
  asset: "btcusdt",
  timeframe: "1h",
  portfolioRunId: 41,
  readiness,
  marketData,
  evaluation,
  portfolio,
});

assert.equal(ready.version, OPERATIONAL_QUALITY_VERSION);
assert.equal(ready.state, "ready");
assert.equal(ready.scope.asset, "BTCUSDT");
assert.equal(ready.checks.portfolio.stabilityCoveragePct, 100);
assert.equal(ready.checks.executionInvariant.state, "ready");

const blockedMarket = buildOperationalQualityOverview({
  generatedAt: new Date("2026-09-27T10:00:00.000Z"),
  asset: "BTCUSDT",
  timeframe: "1h",
  readiness,
  marketData: { ...marketData, status: "stale" as const },
  evaluation,
});

assert.equal(blockedMarket.state, "blocked");
assert.equal(blockedMarket.checks.marketData.state, "blocked");
assert.equal(blockedMarket.checks.portfolio.available, false);

console.log("operational quality tests passed");
