import assert from "node:assert/strict";
import type { DecisionLogRecord, PendingDecisionLogFilters } from "../db/repository.js";
import type { Kline } from "../types.js";
import { settlePendingDecisionLogs, type PendingSettlementDependencies } from "./pendingSettlement.js";
import type { OutcomeSettlementAuditPayload } from "./outcomeSettlementAudit.js";

const candles: Kline[] = [
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
];

function decision(
  id: number,
  recomendacao: DecisionLogRecord["recomendacao"] = "BUY",
): DecisionLogRecord {
  return {
    id,
    ativo: "BTCUSDT",
    timeframe: "1h",
    decisionAt: new Date("2026-09-20T10:00:00Z"),
    dataAsOf: new Date("2026-09-20T10:00:00Z"),
    origem: "baseline",
    recomendacao,
    jevModelVersion: null,
    jevChoice: null,
    jevProbs: null,
    confidence: 0.8,
    qualityScore: 0.9,
    riscoElevado: false,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : 2,
    observacao: null,
    referencePrice: 100,
    outcomeStatus: "pending",
    outcomeDirection: null,
    forwardReturnPercent: null,
    tradeProfitPercent: null,
    exitReason: null,
    evaluatedAt: null,
  };
}

const settled: number[] = [];
const capturedFilters: PendingDecisionLogFilters[] = [];
const deps: PendingSettlementDependencies = {
  listPending: async (filters) => {
    capturedFilters.push(filters ?? {});
    return [decision(1), decision(2, "WAIT")];
  },
  getCandles: async () => candles,
  settle: async (id, _outcome, audit: OutcomeSettlementAuditPayload) => {
    settled.push(id);
    assert.match(audit.evidenceHash, /^[0-9a-f]{64}$/);
    assert.equal(audit.decisionLogId, id);
  },
  evaluate: (log, future, evaluatedAt, config) => {
    assert.equal(future.length, candles.length);
    assert.equal(config.lookaheadCandles, 1);
    assert.equal(config.flatThresholdPct, 0.1);
    return {
      decisionLogId: log.id,
      referencePrice: 100,
      evaluationCandleClose: candles[1].closeTime!,
      evaluationPrice: 103,
      lookaheadCandles: 1,
      forwardReturnPercent: 3,
      outcomeDirection: "up",
      tradeProfitPercent: log.recomendacao === "WAIT" ? null : 3,
      outcome: {
        outcomeStatus: log.recomendacao === "WAIT" ? "not_applicable" : "settled",
        outcomeDirection: "up",
        forwardReturnPercent: 3,
        tradeProfitPercent: log.recomendacao === "WAIT" ? null : 3,
        exitReason: "end",
        evaluatedAt,
      },
    };
  },
  now: () => new Date("2026-09-20T13:00:00Z"),
};

const result = await settlePendingDecisionLogs(
  {
    limit: 10,
    ativo: "btcusdt",
    timeframe: "1h",
    lookaheadCandles: 1,
    flatThresholdPct: 0.1,
  },
  deps,
);

assert.equal(result.scanned, 2);
assert.equal(result.settled, 2);
assert.equal(result.notReady, 0);
assert.equal(result.failed, 0);
assert.deepEqual(settled, [1, 2]);
assert.equal(capturedFilters[0].ativo, "btcusdt");

const notReady = await settlePendingDecisionLogs(
  { lookaheadCandles: 2, evaluatedAt: new Date("2026-09-20T12:00:00Z") },
  {
    ...deps,
    listPending: async () => [decision(3)],
    getCandles: async () => candles.slice(0, 1),
    settle: async () => assert.fail("not-ready decision must not be settled"),
    evaluate: () => {
      throw new Error("Insufficient future closed candles for requested lookahead");
    },
  },
);

assert.equal(notReady.scanned, 1);
assert.equal(notReady.settled, 0);
assert.equal(notReady.notReady, 1);
assert.equal(notReady.failed, 0);

await assert.rejects(
  async () => {
    await settlePendingDecisionLogs({ limit: 0 }, deps);
  },
  /limit must be an integer between 1 and 100/,
);

console.log("pending settlement tests passed");
