import { strict as assert } from "node:assert";
import type {
  DecisionLogInput,
  ResearchSnapshotRecord,
  SaveResearchSnapshotInput,
} from "../db/repository.js";
import { callJev, JevModelVersionMismatchError } from "../jev/jevClient.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { analyzeMarket, type AnalyzeOutput } from "../api/analyze.js";
import type { DecisionResult, Kline, Timeframe } from "../types.js";
import { buildDeterministicReport, type AnalystResearchResult } from "../research/report.js";
import { buildResearchSnapshot } from "../research/snapshot.js";
import { buildOnlineAnalysisPacket } from "./provenance.js";
import {
  listAiProviders,
  runOnlineAnalysis,
  type OnlineAnalysisDependencies,
} from "./service.js";

const providers = listAiProviders();
assert.equal(providers.length, 2);
assert.deepEqual(providers[0], {
  id: "none",
  model: "deterministic",
  configured: true,
  enabled: true,
});
assert.equal(providers[1].id, "gemini");
assert.equal(typeof providers[1].model, "string");
assert.equal(typeof providers[1].configured, "boolean");
assert.equal(typeof providers[1].enabled, "boolean");

const originalModelVersion = process.env.JEV_MODEL_VERSION;
process.env.JEV_MODEL_VERSION = "jev-test-v1";

function makeCandles(): Kline[] {
  const end = Date.now() - 5 * 60 * 1000;
  return Array.from({ length: 100 }, (_, index) => {
    const closeTime = new Date(end - (99 - index) * 60 * 60 * 1000);
    const openTime = new Date(closeTime.getTime() - 60 * 60 * 1000 + 1);
    const close = 100 + index * 0.05;
    return {
      openTime,
      closeTime,
      open: close - 0.1,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + index,
    };
  });
}

const candles = makeCandles();

function makeJevFetch(modelVersion: string): typeof fetch {
  return async (_input, init) => {
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({
      answers: {
        direcao: {
          choice: "ALTA",
          probabilities: { ALTA: 0.8, BAIXA: 0.1, AGUARDAR: 0.1 },
          confidence: 0.9,
        },
        risco_elevado: {
          noul: 0.1,
          probabilities: { ALTA: 0.1, BAIXA: 0.1, AGUARDAR: 0.8 },
          confidence: 0.9,
        },
        qualidade: {
          score: 0.9,
          probabilities: { Baixa: 0.1, Moderada: 0.2, Alta: 0.7 },
          confidence: 0.9,
        },
      },
      modelVersion,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function makeRepositoryMocks() {
  const persistedSignals: Array<{
    ativo: string;
    timeframe: Timeframe;
    decision: DecisionResult;
    entrada: number | null;
  }> = [];
  const persistedDecisionLogs: DecisionLogInput[] = [];
  const persistedMarketData: Kline[][] = [];
  const persistedSnapshots: SaveResearchSnapshotInput[] = [];

  const saveSignal = async (
    ativo: string,
    timeframe: Timeframe,
    decision: DecisionResult,
    levels?: { entrada?: number | null },
  ): Promise<number> => {
    persistedSignals.push({
      ativo,
      timeframe,
      decision,
      entrada: levels?.entrada ?? null,
    });
    return 101;
  };

  const saveDecisionLog = async (input: DecisionLogInput): Promise<number> => {
    persistedDecisionLogs.push(input);
    return 202;
  };

  const saveMarketData = async (
    _ativo: string,
    _timeframe: Timeframe,
    klines: Kline[],
  ): Promise<number> => {
    persistedMarketData.push(klines);
    return klines.length;
  };

  const saveResearchSnapshot = async (
    input: SaveResearchSnapshotInput,
  ): Promise<ResearchSnapshotRecord> => {
    persistedSnapshots.push(input);
    return {
      snapshotId: input.snapshot.snapshotId,
      schemaVersion: input.snapshot.schemaVersion,
      contentHash: input.snapshot.contentHash,
      signalId: input.snapshot.analysis.signalId,
      decisionLogId: input.decisionLogId ?? null,
      ativo: input.snapshot.analysis.ativo,
      timeframe: input.snapshot.analysis.timeframe,
      dataAsOf: new Date(input.snapshot.analysis.dataAsOf),
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      snapshot: input.snapshot,
    };
  };

  return {
    saveSignal,
    saveDecisionLog,
    saveMarketData,
    saveResearchSnapshot,
    persistedSignals,
    persistedDecisionLogs,
    persistedMarketData,
    persistedSnapshots,
  };
}

function makeOnlineDependencies(
  callJevImpl: typeof callJev,
): {
  dependencies: Partial<OnlineAnalysisDependencies>;
  persistence: ReturnType<typeof makeRepositoryMocks>;
} {
  const persistence = makeRepositoryMocks();

  const analyzeWithMocks: OnlineAnalysisDependencies["analyzeMarket"] = async (input) =>
    analyzeMarket(input, {
      getMarketData: async () => candles,
      decideWithJev: async (market, mode) => decideWithJev(market, mode, callJevImpl),
      saveSignal: persistence.saveSignal,
      saveDecisionLog: persistence.saveDecisionLog,
      saveMarketData: persistence.saveMarketData,
    });

  const generateResearch: OnlineAnalysisDependencies["generateAnalystReport"] =
    async (analysis): Promise<AnalystResearchResult> => ({
      asOf: new Date(analysis.market.dataAsOf).toISOString(),
      sentiment: 0,
      evidence: [],
      sources: [],
      report: buildDeterministicReport(analysis, 0, []),
    });

  const dependencies: Partial<OnlineAnalysisDependencies> = {
    analyzeMarket: analyzeWithMocks,
    generateAnalystReport: generateResearch,
    buildResearchSnapshot,
    saveResearchSnapshot: persistence.saveResearchSnapshot,
    buildOnlineAnalysisPacket,
  };

  return { dependencies, persistence };
}

const input = {
  ativo: "BTCUSDT",
  timeframe: "1h" as Timeframe,
  valorInvestimento: 1000,
  engine: "jev" as const,
  news: false,
};

try {
  const happy = makeOnlineDependencies(async (market) =>
    callJev(market, {
      credential: "mock-gateway-token",
      fetchImpl: makeJevFetch("jev-test-v1"),
      sleepImpl: async () => undefined,
      timeoutMs: 1000,
    }),
  );
  const happyResult = await runOnlineAnalysis(input, "none", happy.dependencies);

  assert.equal(happyResult.analysis.signalId, 101);
  assert.equal(happyResult.analysis.decisionLogId, 202);
  assert.equal(happyResult.analysis.decision.recomendacao, "BUY");
  assert.equal(happyResult.analysis.decision.tamanhoPosicaoPct, 1.5);
  assert.equal(happyResult.ai, null);
  assert.equal(happy.persistence.persistedSignals.length, 1);
  assert.equal(happy.persistence.persistedSignals[0].ativo, "BTCUSDT");
  assert.equal(happy.persistence.persistedSignals[0].timeframe, "1h");
  assert.equal(happy.persistence.persistedSignals[0].entrada !== null, true);
  assert.equal(happy.persistence.persistedDecisionLogs.length, 1);
  assert.equal(happy.persistence.persistedDecisionLogs[0].decision.recomendacao, "BUY");
  assert.equal(happy.persistence.persistedMarketData.length, 1);
  assert.equal(happy.persistence.persistedMarketData[0].length, 100);
  assert.equal(happy.persistence.persistedSnapshots.length, 1);
  assert.equal(
    happy.persistence.persistedSnapshots[0].snapshot.snapshotId,
    happyResult.snapshot.snapshotId,
  );
  assert.equal(
    happy.persistence.persistedSnapshots[0].decisionLogId,
    happyResult.analysis.decisionLogId,
  );
  assert.equal(happyResult.packet.provenance.decisionLogId, 202);

  const unavailable = makeOnlineDependencies(async (market) =>
    callJev(market, {
      credential: "mock-gateway-token",
      fetchImpl: async () => {
        throw new TypeError("network offline");
      },
      sleepImpl: async () => undefined,
      timeoutMs: 1000,
    }),
  );
  const unavailableResult = await runOnlineAnalysis(
    input,
    "none",
    unavailable.dependencies,
  );

  assert.equal(unavailableResult.analysis.decision.recomendacao, "WAIT");
  assert.equal(unavailableResult.analysis.decision.tamanhoPosicaoPct, 0);
  assert.equal(unavailableResult.analysis.valorExposto, 0);
  assert.equal(unavailableResult.analysis.decision.jevModelVersion, "unreported");
  assert.match(unavailableResult.analysis.decision.observacao ?? "", /fallback=WAIT/);
  assert.equal(unavailable.persistence.persistedSignals[0].entrada, null);

  const mismatch = makeOnlineDependencies(async (market) =>
    callJev(market, {
      credential: "mock-gateway-token",
      fetchImpl: makeJevFetch("jev-other-v2"),
      sleepImpl: async () => undefined,
      timeoutMs: 1000,
    }),
  );

  await assert.rejects(
    () => runOnlineAnalysis(input, "none", mismatch.dependencies),
    (error: unknown) =>
      error instanceof JevModelVersionMismatchError &&
      /expected "jev-test-v1"/.test(error.message) &&
      /jev-other-v2/.test(error.message),
  );
  assert.equal(mismatch.persistence.persistedSignals.length, 0);
} finally {
  if (originalModelVersion === undefined) delete process.env.JEV_MODEL_VERSION;
  else process.env.JEV_MODEL_VERSION = originalModelVersion;
}

console.log("online service tests passed");
