import assert from "node:assert/strict";
import { computeDatasetHash } from "../marketdata/dataset.js";
import { evaluateJevResponse } from "../decision/decisionEngine.js";
import type { JevResponse } from "../jev/jevClient.js";
import { evaluateRisk } from "../risk/riskEngine.js";
import { simulateTrade, DEFAULT_EXECUTION_COSTS, EXECUTION_MODEL_VERSION } from "../papertrading/simulator.js";
import { evaluateDecisionLog } from "../evaluation/decisionEvaluator.js";
import { buildOutcomeSettlementAudit } from "../evaluation/outcomeSettlementAudit.js";
import { buildValidationHistoryOverview } from "./validationHistory.js";
import type { DecisionLogRecord } from "../db/repository.js";
import type { Kline } from "../types.js";

const signalAt = new Date("2026-09-29T10:00:00.000Z");
const candle1 = {
  openTime: new Date("2026-09-29T11:00:00.000Z"),
  closeTime: new Date("2026-09-29T11:59:59.999Z"),
  open: 100,
  high: 102,
  low: 99.5,
  close: 101,
  volume: 10,
};
const candle2 = {
  openTime: new Date("2026-09-29T12:00:00.000Z"),
  closeTime: new Date("2026-09-29T12:59:59.999Z"),
  open: 101,
  high: 104,
  low: 100.5,
  close: 103,
  volume: 12,
};
const candles: Kline[] = [
  {
    openTime: signalAt,
    closeTime: new Date("2026-09-29T10:59:59.999Z"),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 9,
  },
  candle1,
  candle2,
];

const jev: JevResponse = {
  direcao: {
    choice: "ALTA",
    confidence: 0.9,
    probabilities: { ALTA: 0.8, BAIXA: 0.1, AGUARDAR: 0.1 },
  },
  risco_elevado: { noul: 0.1, probabilities: {}, confidence: 0.9 },
  qualidade: { score: 0.9, probabilities: {}, confidence: 0.9 },
} as JevResponse;

const decision = evaluateJevResponse(jev);
assert.equal(decision.recomendacao, "BUY");
assert.equal(decision.tamanhoPosicaoPct, 1.5);
assert.equal(decision.riscoElevado, false);

const regime = { key: "normal", volatility: "NORMAL" } as any;
const risk = evaluateRisk(decision, regime);
assert.equal(risk.allowed, true);
assert.equal(risk.positionSizePct, 1.5);
assert.equal(risk.maxGrossExposurePct, 15);

const persistedDecision: DecisionLogRecord = {
  id: 57001,
  ativo: "BTCUSDT",
  timeframe: "1h",
  decisionAt: signalAt,
  dataAsOf: new Date("2026-09-29T10:59:59.999Z"),
  origem: decision.origem,
  recomendacao: decision.recomendacao,
  jevModelVersion: decision.jevModelVersion ?? null,
  jevChoice: decision.jevChoice ?? null,
  jevProbs: decision.jevProbs ?? null,
  confidence: decision.confidence ?? null,
  qualityScore: decision.qualityScore ?? null,
  riscoElevado: decision.riscoElevado ?? null,
  tamanhoPosicaoPct: risk.positionSizePct,
  observacao: decision.observacao ?? null,
  referencePrice: 100,
  outcomeStatus: "pending",
  outcomeDirection: null,
  forwardReturnPercent: null,
  tradeProfitPercent: null,
  exitReason: null,
  evaluatedAt: null,
};

const evaluatedAt = candle2.closeTime!;
const evaluation = evaluateDecisionLog(
  persistedDecision,
  candles,
  evaluatedAt,
  { lookaheadCandles: 2, flatThresholdPct: 0.1 },
);
assert.equal(evaluation.outcome.outcomeStatus, "settled");
assert.equal(evaluation.evaluationPrice, 103);
assert.equal(evaluation.forwardReturnPercent, 3);
assert.equal(evaluation.tradeProfitPercent, 3);

const execution = simulateTrade(
  "BUY",
  candles[0],
  [candle1, candle2],
  0.01,
  0.005,
  DEFAULT_EXECUTION_COSTS,
);
assert.equal(execution.outcome, "win");
assert.equal(execution.exitReason, "target");
assert.equal(execution.candlesHeld, 1);
assert.ok(execution.exitPrice !== null);
assert.equal(EXECUTION_MODEL_VERSION, "v2");

const settlementAudit = buildOutcomeSettlementAudit({
  decision: persistedDecision,
  candles,
  evaluation,
  evaluatedAt,
  config: { lookaheadCandles: 2, flatThresholdPct: 0.1 },
});
assert.equal(settlementAudit.version, "outcome-settlement-audit.v1");
assert.equal(settlementAudit.outcomeStatus, "settled");
assert.equal(settlementAudit.futureClosedCandleCount, 2);
assert.match(settlementAudit.marketDataHash, /^[0-9a-f]{64}$/);
assert.match(settlementAudit.evidenceHash, /^[0-9a-f]{64}$/);
assert.equal(settlementAudit.source, "persisted-market-data");

const persistedArtifacts = new Map<string, unknown>();
persistedArtifacts.set("market-data", {
  asset: "BTCUSDT",
  timeframe: "1h",
  dataAsOf: persistedDecision.dataAsOf.toISOString(),
  datasetHash: computeDatasetHash(candles),
});
persistedArtifacts.set("decision", persistedDecision);
persistedArtifacts.set("paper-trade", execution);
persistedArtifacts.set("settlement-audit", settlementAudit);

const restoredDecision = persistedArtifacts.get("decision") as DecisionLogRecord;
const restoredAudit = persistedArtifacts.get("settlement-audit") as typeof settlementAudit;
assert.equal(restoredDecision.id, persistedDecision.id);
assert.equal(restoredDecision.dataAsOf.toISOString(), persistedDecision.dataAsOf.toISOString());
assert.equal(restoredAudit.evidenceHash, settlementAudit.evidenceHash);

const validationSnapshot = {
  version: "system-validation.v1",
  generatedAt: evaluatedAt.toISOString(),
  state: "ready",
  scope: { asset: "BTCUSDT", timeframe: "1h", fromRun: null, lookbackDays: 30 },
  summary: { readyCount: 9, degradedCount: 0, blockedCount: 0, blockingFailures: 0 },
  checks: [],
  contracts: ["system-validation.v1", "outcome-settlement-audit.v1"],
  evidenceHash: settlementAudit.evidenceHash,
  interpretation: {
    readyMeans: "controlled E2E validation ready",
    blockedMeans: "controlled E2E validation blocked",
    notAnInvestmentVerdict: true,
  },
  notes: [],
} as any;

const history = buildValidationHistoryOverview({
  generatedAt: evaluatedAt,
  asset: "BTCUSDT",
  timeframe: "1h",
  snapshots: [{
    id: 57001,
    generatedAt: evaluatedAt,
    createdAt: evaluatedAt,
    ativo: "BTCUSDT",
    timeframe: "1h",
    fromRun: null,
    lookbackDays: 30,
    state: "ready",
    readyCount: 9,
    degradedCount: 0,
    blockedCount: 0,
    blockingFailures: 0,
    evidenceHash: settlementAudit.evidenceHash,
    snapshot: validationSnapshot,
  }],
});

assert.equal(history.current?.snapshotId, 57001);
assert.equal(history.checks.temporalOrderValid, true);
assert.equal(history.checks.evidenceHashesValid, true);
assert.equal(history.checks.scopeConsistent, true);
assert.equal(history.count, 1);

console.log("controlled paper-trading E2E validation: PASS");
console.log(JSON.stringify({
  asset: "BTCUSDT",
  timeframe: "1h",
  decision: decision.recomendacao,
  positionSizePct: risk.positionSizePct,
  riskAllowed: risk.allowed,
  paperOutcome: execution.outcome,
  exitReason: execution.exitReason,
  settlementStatus: settlementAudit.outcomeStatus,
  settlementEvidenceHash: settlementAudit.evidenceHash,
  validationState: history.current?.state,
  validationEvidenceHash: history.current?.evidenceHash,
}, null, 2));
