import assert from "node:assert/strict";
import { evaluateDecisionLog } from "./decisionEvaluator.js";
import type { DecisionLogRecord } from "../db/repository.js";

const base: DecisionLogRecord = {
  id: 7,
  ativo: "BTCUSDT",
  timeframe: "1h",
  decisionAt: new Date("2026-09-20T10:00:00Z"),
  dataAsOf: new Date("2026-09-20T10:00:00Z"),
  origem: "baseline",
  recomendacao: "BUY",
  jevModelVersion: null,
  jevChoice: null,
  jevProbs: null,
  confidence: 0.8,
  qualityScore: 0.9,
  riscoElevado: false,
  tamanhoPosicaoPct: 2,
  observacao: null,
  referencePrice: 100,
  outcomeStatus: "pending",
  outcomeDirection: null,
  forwardReturnPercent: null,
  tradeProfitPercent: null,
  exitReason: null,
  evaluatedAt: null,
};

const candles = [
  {
    openTime: new Date("2026-09-20T10:00:00Z"),
    closeTime: new Date("2026-09-20T11:00:00Z"),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 10,
  },
  {
    openTime: new Date("2026-09-20T11:00:00Z"),
    closeTime: new Date("2026-09-20T12:00:00Z"),
    open: 101,
    high: 104,
    low: 100,
    close: 103,
    volume: 12,
  },
  {
    openTime: new Date("2026-09-20T12:00:00Z"),
    closeTime: new Date("2026-09-20T13:00:00Z"),
    open: 103,
    high: 106,
    low: 102,
    close: 105,
    volume: 14,
  },
];

const evaluation = evaluateDecisionLog(
  base,
  candles,
  new Date("2026-09-20T13:00:00Z"),
  { lookaheadCandles: 2, flatThresholdPct: 0.1 },
);

assert.equal(evaluation.evaluationPrice, 103);
assert.equal(Number(evaluation.forwardReturnPercent.toFixed(4)), 3);
assert.equal(evaluation.outcomeDirection, "up");
assert.equal(Number((evaluation.tradeProfitPercent ?? 0).toFixed(4)), 3);
assert.equal(evaluation.outcome.outcomeStatus, "settled");

const sell = evaluateDecisionLog(
  { ...base, id: 8, recomendacao: "SELL" },
  candles,
  new Date("2026-09-20T13:00:00Z"),
  { lookaheadCandles: 2, flatThresholdPct: 0.1 },
);
assert.equal(Number((sell.tradeProfitPercent ?? 0).toFixed(4)), -3);

const wait = evaluateDecisionLog(
  { ...base, id: 9, recomendacao: "WAIT" },
  candles,
  new Date("2026-09-20T13:00:00Z"),
  { lookaheadCandles: 2, flatThresholdPct: 0.1 },
);
assert.equal(wait.tradeProfitPercent, null);
assert.equal(wait.outcome.outcomeStatus, "not_applicable");

assert.throws(
  () =>
    evaluateDecisionLog(
      base,
      candles,
      new Date("2026-09-20T13:00:00Z"),
      { lookaheadCandles: 3, flatThresholdPct: 0.1 },
    ),
  /Insufficient future closed candles/,
);

console.log("decision evaluator tests passed");
