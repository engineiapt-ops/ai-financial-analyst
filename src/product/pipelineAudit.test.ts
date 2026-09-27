import { strict as assert } from "node:assert";
import type { OosValidationGateAuditRecord } from "../db/repository.js";
import type { PortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";
import {
  buildPipelineAuditOverview,
  comparePipelineAudits,
  PIPELINE_AUDIT_VERSION,
} from "./pipelineAudit.js";

const sourceRun = {
  id: 41,
  ativo: "BTCUSDT" as const,
  timeframe: "1h" as const,
  candlesTotal: 1000,
  datasetHash: "a".repeat(64),
  datasetStart: new Date("2025-01-01T00:00:00Z"),
  datasetEnd: new Date("2026-09-01T00:00:00Z"),
  initialTrainCandles: 700,
  testCandles: 100,
  stepCandles: 100,
  lookaheadCandles: 20,
  executionModelVersion: "exec-v1",
};

function audit(
  id: number,
  strategy: "baseline" | "baseline_risk",
  status: "ready" | "blocked",
  walkForwardRunId: number | null = 41,
): OosValidationGateAuditRecord {
  return {
    id,
    backtestRunId: 10 + id,
    walkForwardRunId,
    ativo: "BTCUSDT",
    timeframe: "1h",
    estrategia: strategy,
    gateVersion: "oos-validation-gate.v1",
    status,
    validationFrom: new Date("2026-08-01T00:00:00Z"),
    validationTo: new Date("2026-09-01T00:00:00Z"),
    evidenceHash: "b".repeat(64),
    createdAt: new Date("2026-09-20T00:00:00Z"),
    gate: {} as OosValidationGateAuditRecord["gate"],
    evidence: null,
  };
}

const portfolio = {
  version: "portfolio-governance-overview.v2",
  generatedAt: "2026-09-21T00:00:00.000Z",
  scope: {
    walkForwardRunId: 41,
    asset: "BTCUSDT",
    timeframe: "1h",
    candlesTotal: 1000,
    datasetHash: "a".repeat(64),
  },
  portfolio: {
    strategyCount: 2,
    foldCount: 5,
    allChecksPassed: true,
    checksPassed: 5,
    checksTotal: 5,
    diagnostics: {
      totalRiskGateBlocks: 1,
      foldsWithPositiveRiskReturnDelta: 3,
      foldsWithLowerRiskDrawdown: 4,
      foldCount: 5,
    },
    strategies: [
      {
        strategy: "baseline",
        portfolioModelVersion: "portfolio-v1",
        finalEquity: 1000,
        totalReturnPct: 1,
        cagrPct: 1,
        maxDrawdownPct: 2,
        sharpe: 0.5,
        sortino: 0.7,
        totalSignals: 100,
        executedTrades: 50,
        rejectedTrades: 50,
        riskGateBlocks: 0,
        checks: {
          exposureConstraint: {
            passed: true,
            maxAllowedOpenPositions: 5,
            observedMaxOpenPositions: 2,
          },
          finiteCapital: true,
          signalsConsistent: true,
        },
        stability: {
          version: "portfolio-stability.v1",
          foldCount: 5,
          positiveReturnFoldCount: 3,
          positiveReturnFoldPct: 60,
          nonNegativeReturnFoldPct: 80,
          returnMeanPct: 0.2,
          returnMedianPct: 0.2,
          returnStdDevPct: 0.1,
          bestFoldReturnPct: 0.4,
          worstFoldReturnPct: -0.1,
          drawdownMeanPct: 1,
          drawdownMedianPct: 1,
          drawdownStdDevPct: 0.2,
          worstDrawdownPct: 2,
          medianSharpe: 0.5,
          medianSortino: 0.7,
          closedTradesTotal: 25,
          closedTradesMedian: 5,
        },
      },
      {
        strategy: "baseline_risk",
        portfolioModelVersion: "portfolio-v1",
        finalEquity: 1000,
        totalReturnPct: 1,
        cagrPct: 1,
        maxDrawdownPct: 2,
        sharpe: 0.5,
        sortino: 0.7,
        totalSignals: 100,
        executedTrades: 50,
        rejectedTrades: 50,
        riskGateBlocks: 1,
        checks: {
          exposureConstraint: {
            passed: true,
            maxAllowedOpenPositions: 5,
            observedMaxOpenPositions: 2,
          },
          finiteCapital: true,
          signalsConsistent: true,
        },
        stability: {
          version: "portfolio-stability.v1",
          foldCount: 5,
          positiveReturnFoldCount: 2,
          positiveReturnFoldPct: 40,
          nonNegativeReturnFoldPct: 60,
          returnMeanPct: 0.1,
          returnMedianPct: 0.1,
          returnStdDevPct: 0.1,
          bestFoldReturnPct: 0.3,
          worstFoldReturnPct: -0.1,
          drawdownMeanPct: 1.2,
          drawdownMedianPct: 1.1,
          drawdownStdDevPct: 0.2,
          worstDrawdownPct: 2,
          medianSharpe: 0.4,
          medianSortino: 0.6,
          closedTradesTotal: 24,
          closedTradesMedian: 5,
        },
      },
    ],
  },
  regimes: {
    totalSignals: 100,
    totalRiskGateBlocks: 1,
    blockedSignalWinRatePct: 20,
    blockedSignalLossRatePct: 60,
    foldCount: 5,
    byTrend: [],
    byVolatility: [],
    byMomentum: [],
    byCombinedRegime: [],
  },
  notes: [],
} as unknown as PortfolioGovernanceOverview;

const ready = buildPipelineAuditOverview({
  generatedAt: new Date("2026-09-27T10:00:00Z"),
  sourceRun,
  audits: [audit(2, "baseline_risk", "ready"), audit(1, "baseline", "ready")],
  portfolio,
});

assert.equal(ready.version, PIPELINE_AUDIT_VERSION);
assert.equal(ready.state, "ready");
assert.equal(ready.traceability.dataset.hash, "a".repeat(64));
assert.equal(ready.traceability.oos.latestByStrategy.length, 2);
assert.equal(ready.traceability.portfolio.stabilityCoveragePct, 100);
assert.equal(ready.blockingReasons.length, 0);
assert.equal(ready.evidenceHash.length, 64);

const blocked = buildPipelineAuditOverview({
  generatedAt: new Date("2026-09-27T10:00:00Z"),
  sourceRun,
  audits: [audit(3, "baseline_risk", "blocked"), audit(1, "baseline", "ready")],
  portfolio,
});

assert.equal(blocked.state, "blocked");
assert.ok(blocked.blockingReasons.some((message) => message.includes("Latest OOS audits")));

const previous = ready;
const current = buildPipelineAuditOverview({
  generatedAt: new Date("2026-09-27T11:00:00Z"),
  sourceRun,
  audits: [audit(4, "baseline_risk", "blocked"), audit(1, "baseline", "ready")],
  portfolio,
});

const regression = comparePipelineAudits(previous, current);
assert.equal(regression.comparable, true);
assert.equal(regression.regressed, true);
assert.ok(regression.events.some((event) => event.kind === "state-regression"));
assert.ok(
  regression.events.some(
    (event) => event.kind === "oos-status-regression" && event.strategy === "baseline_risk",
  ),
);

const scopeChange = buildPipelineAuditOverview({
  generatedAt: new Date("2026-09-27T12:00:00Z"),
  sourceRun: { ...sourceRun, datasetHash: "c".repeat(64) },
  audits: [audit(2, "baseline_risk", "ready"), audit(1, "baseline", "ready")],
  portfolio: {
    ...portfolio,
    scope: { ...portfolio.scope, datasetHash: "c".repeat(64) },
  },
});

const comparison = comparePipelineAudits(ready, scopeChange);
assert.equal(comparison.regressed, false);
assert.ok(comparison.events.some((event) => event.kind === "scope-change"));

console.log("pipeline audit tests passed");
