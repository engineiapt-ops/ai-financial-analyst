import assert from "node:assert/strict";
import type { DecisionLogRecord } from "../db/repository.js";
import type { Kline } from "../types.js";
import { buildOutcomeSettlementAudit } from "./outcomeSettlementAudit.js";

const decision: DecisionLogRecord = {
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

const candles: Kline[] = [
  {
    openTime: new Date("2026-09-20T10:00:00Z"),
    closeTime: new Date("2026-09-20T10:59:59.999Z"),
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 10,
  },
  {
    openTime: new Date("2026-09-20T11:00:00Z"),
    closeTime: new Date("2026-09-20T11:59:59.999Z"),
    open: 100.5,
    high: 103,
    low: 100,
    close: 102,
    volume: 12,
  },
];

const evaluation = {
  decisionLogId: 7,
  referencePrice: 100,
  evaluationCandleClose: candles[1].closeTime!,
  evaluationPrice: 102,
  lookaheadCandles: 1,
  forwardReturnPercent: 2,
  outcomeDirection: "up" as const,
  tradeProfitPercent: 2,
  outcome: {
    outcomeStatus: "settled" as const,
    outcomeDirection: "up" as const,
    forwardReturnPercent: 2,
    tradeProfitPercent: 2,
    exitReason: "end" as const,
    evaluatedAt: new Date("2026-09-20T13:00:00Z"),
  },
};

const audit = buildOutcomeSettlementAudit({
  decision,
  candles,
  evaluation,
  evaluatedAt: new Date("2026-09-20T13:00:00Z"),
  config: { lookaheadCandles: 1, flatThresholdPct: 0.1 },
});

assert.equal(audit.version, "outcome-settlement-audit.v1");
assert.equal(audit.decisionLogId, 7);
assert.equal(audit.futureClosedCandleCount, 1);
assert.equal(audit.evaluationPrice, 102);
assert.match(audit.marketDataHash, /^[0-9a-f]{64}$/);
assert.match(audit.evidenceHash, /^[0-9a-f]{64}$/);
assert.equal(audit.source, "persisted-market-data");

const equivalent = buildOutcomeSettlementAudit({
  decision,
  candles,
  evaluation,
  evaluatedAt: new Date("2026-09-20T13:00:00Z"),
  config: { lookaheadCandles: 1, flatThresholdPct: 0.1 },
});
assert.equal(equivalent.evidenceHash, audit.evidenceHash);

const changed = buildOutcomeSettlementAudit({
  decision,
  candles: [
    candles[0],
    { ...candles[1], close: 104 },
  ],
  evaluation: {
    ...evaluation,
    evaluationPrice: 104,
    forwardReturnPercent: 4,
    tradeProfitPercent: 4,
  },
  evaluatedAt: new Date("2026-09-20T13:00:00Z"),
  config: { lookaheadCandles: 1, flatThresholdPct: 0.1 },
});
assert.notEqual(changed.marketDataHash, audit.marketDataHash);
assert.notEqual(changed.evidenceHash, audit.evidenceHash);

console.log("outcome settlement audit tests passed");
