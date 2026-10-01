import assert from "node:assert/strict";
import { runJevPaperCycle } from "./jevPaperCycle.js";
import type { AnalyzeOutput } from "../api/analyze.js";
import type { DecisionLogRecord } from "../db/repository.js";
import type { Kline } from "../types.js";

const now = new Date("2026-10-01T01:00:00.000Z");
const candles: Kline[] = Array.from({ length: 21 }, (_, index) => ({
  openTime: new Date(now.getTime() - (21 - index) * 60 * 60 * 1000),
  closeTime: new Date(now.getTime() - (21 - index) * 60 * 60 * 1000 + 59 * 60 * 1000),
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 10,
}));

const analyzedOutput = {
  signalId: 1,
  decisionLogId: 101,
  market: {} as AnalyzeOutput["market"],
  decision: {
    origem: "jev",
    recomendacao: "BUY",
    tamanhoPosicaoPct: 1.5,
    probabilidadeDirecional: 0.8,
    confidence: 0.9,
  },
  valorInvestimento: 100,
  valorExposto: 1.5,
  candlesAnalisados: candles.length,
  marketDataQuality: {} as AnalyzeOutput["marketDataQuality"],
  risk: {} as AnalyzeOutput["risk"],
} as AnalyzeOutput;

let existing: DecisionLogRecord | null = null;
let analyzeCalls = 0;

const deps = {
  now: () => now,
  fetchCandles: async () => candles,
  findExisting: async () => existing,
  analyze: async () => {
    analyzeCalls += 1;
    return analyzedOutput;
  },
};

const first = await runJevPaperCycle(
  { ativo: "btcusdt", timeframes: ["1h"] },
  deps,
);

assert.equal(first.analyzed, 1);
assert.equal(first.skippedExisting, 0);
assert.equal(first.failed, 0);
assert.equal(first.results[0]?.status, "analyzed");
assert.equal(first.results[0]?.probability, 0.8);
assert.equal(analyzeCalls, 1);

existing = {
  id: 101,
  ativo: "BTCUSDT",
  timeframe: "1h",
  decisionAt: now,
  dataAsOf: candles[candles.length - 1].closeTime!,
  origem: "jev",
  recomendacao: "BUY",
  jevModelVersion: "gateway-managed",
  jevChoice: "ALTA",
  jevProbs: { ALTA: 0.8, BAIXA: 0.1, AGUARDAR: 0.1 },
  confidence: 0.9,
  qualityScore: 0.9,
  riscoElevado: false,
  tamanhoPosicaoPct: 1.5,
  observacao: null,
  referencePrice: 120,
  outcomeStatus: "pending",
  outcomeDirection: null,
  forwardReturnPercent: null,
  tradeProfitPercent: null,
  exitReason: null,
  evaluatedAt: null,
};

const second = await runJevPaperCycle(
  { ativo: "BTCUSDT", timeframes: ["1h"] },
  deps,
);

assert.equal(second.analyzed, 0);
assert.equal(second.skippedExisting, 1);
assert.equal(second.results[0]?.status, "skipped_existing");
assert.equal(second.results[0]?.decisionLogId, 101);
assert.equal(analyzeCalls, 1);

console.log("JEV paper cycle tests passed");
