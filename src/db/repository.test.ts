import assert from "node:assert/strict";
import { createRepository, type RepositoryPool } from "./repository.js";
import { computeDatasetHash } from "../marketdata/dataset.js";
import type { DecisionResult } from "../types.js";

class FakeClient {
  queries: string[] = [];
  async query<T = any>(text: string, _values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(text);
    if (text.includes("INSERT INTO market_data")) return { rows: [] };
    if (text.includes("INSERT INTO research_snapshots")) {
      return {
        rows: [{
          snapshot_id: "rs_1234567890abcdef12345678",
          schema_version: "research-snapshot.v1",
          content_hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          signal_id: 7,
          decision_log_id: null,
          ativo: "BTCUSDT",
          timeframe: "1h",
          data_as_of: new Date("2026-01-10T00:00:00Z"),
          created_at: new Date("2026-01-10T00:00:00Z"),
          snapshot: {
            snapshotId: "rs_1234567890abcdef12345678",
            contentHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        }],
      } as { rows: T[] };
    }
    if (text.includes("FROM research_snapshots")) {
      return {
        rows: [{
          snapshot_id: "rs_1234567890abcdef12345678",
          schema_version: "research-snapshot.v1",
          content_hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          signal_id: 7,
          decision_log_id: null,
          ativo: "BTCUSDT",
          timeframe: "1h",
          data_as_of: new Date("2026-01-10T00:00:00Z"),
          created_at: new Date("2026-01-10T00:00:00Z"),
          snapshot: {
            snapshotId: "rs_1234567890abcdef12345678",
            contentHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        }],
      } as { rows: T[] };
    }

    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
    return { rows: [{ id: 7 }] } as { rows: T[] };
  }
  release() {}
}

class FakeDb implements RepositoryPool {
  queries: string[] = [];
  client = new FakeClient();
  async query<T = any>(text: string, _values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(text);
    if (text.includes("SELECT 1")) return { rows: [] };
    if (text.includes("FROM backtest_runs") && text.includes("WHERE id = $1")) {
      return {
        rows: [{
          id: 7,
          engine: "baseline",
          mode: "oos",
          ativo: "BTCUSDT",
          timeframe: "1h",
          periodo_inicio: new Date("2026-01-01T00:00:00Z"),
          periodo_fim: new Date("2026-01-10T00:00:00Z"),
          oos_start_ratio: 0.7,
          thresholds_congelados_em: new Date("2026-01-10T00:00:00Z"),
          candles_total: 1000,
          dataset_hash: "abcd1234ef",
          execution_model_version: "v2",
          target_pct: 0.01,
          stop_pct: 0.005,
          lookahead_candles: 20,
          slippage_pct: 0.0005,
          fee_pct: 0.001,
          criado_em: new Date("2026-01-10T00:00:00Z"),
        }],
      } as { rows: T[] };
    }
    if (text.includes("WHERE ativo = $1 AND timeframe = $2 AND open_time >=")) {
      return {
        rows: [{
          openTime: new Date("2026-01-01T00:00:00Z"),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 10,
        }],
      } as { rows: T[] };
    }
    if (text.includes("GROUP BY origem") || text.includes("GROUP BY s.origem")) {
      return {
        rows: [{
          origem: "jev",
          total: 2,
          total_trades: 3,
          closed_trades: 2,
          open_trades: 1,
          win_rate: 50,
          profit_factor: 1.25,
          total_profit_percent: 1.5,
          avg_profit_percent: 0.75,
          expectancy_percent: 0.75,
          max_drawdown_percent: 0.5,
          gross_total_profit_percent: 1.9,
          total_fee_percent: 0.2,
          total_slippage_percent: 0.1,
          avg_candles_held: 4,
        }],
      } as { rows: T[] };
    }
    if (text.includes("INSERT INTO config")) return { rows: [] };
    return { rows: [{ id: 7 }] } as { rows: T[] };
  }
  async connect() { return this.client as any; }
}

const db = new FakeDb();
const repo = createRepository(db);

const decision: DecisionResult = {
  origem: "jev",
  recomendacao: "BUY",
  tamanhoPosicaoPct: 2,
  qualityScore: 0.8,
  riscoElevado: false,
  jevChoice: "ALTA",
  jevProbs: { ALTA: 0.75, BAIXA: 0.2, AGUARDAR: 0.05 },
  jevModelVersion: "jev-1.13",
};

// 1. Dataset Hash Tests
const sampleKlines = [
  { openTime: new Date("2026-01-01T00:00:00Z"), open: 100, high: 110, low: 90, close: 105, volume: 10 },
  { openTime: new Date("2026-01-01T01:00:00Z"), open: 105, high: 115, low: 100, close: 112, volume: 12 },
];
const hash1 = computeDatasetHash(sampleKlines);
const hash2 = computeDatasetHash(sampleKlines);
assert.equal(hash1, hash2, "Dataset hash must be deterministic");
assert.equal(typeof hash1, "string");
assert.equal(hash1.length, 64, "SHA-256 hex length must be 64");

// Sensitivity check
const modifiedKlines = [
  { openTime: new Date("2026-01-01T00:00:00Z"), open: 100, high: 110, low: 90, close: 105.1, volume: 10 },
  { openTime: new Date("2026-01-01T01:00:00Z"), open: 105, high: 115, low: 100, close: 112, volume: 12 },
];
const hashModified = computeDatasetHash(modifiedKlines);
assert.notEqual(hash1, hashModified, "Changing candle close price must change dataset hash");

// 2. Create and Read Backtest Run with Dataset Hash
const runId = await repo.createBacktestRun({
  engine: "baseline",
  mode: "oos",
  ativo: "BTCUSDT",
  timeframe: "1h",
  periodoInicio: new Date("2026-01-01T00:00:00Z"),
  periodoFim: new Date("2026-01-10T00:00:00Z"),
  oosStartRatio: 0.7,
  thresholdsCongeladosEm: new Date("2026-01-10T00:00:00Z"),
  candlesTotal: 1000,
  datasetHash: hash1,
});
assert.equal(runId, 7);
assert.match(db.queries.find((q) => q.includes("candles_total")) ?? "", /dataset_hash/);

const runRecord = await repo.getBacktestRun(runId);
assert.ok(runRecord);
assert.equal(runRecord?.id, 7);
assert.equal(runRecord?.candlesTotal, 1000);
assert.equal(runRecord?.datasetHash, "abcd1234ef");


const snapshot = {
  schemaVersion: "research-snapshot.v1",
  snapshotId: "rs_1234567890abcdef12345678",
  contentHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  createdAt: "2026-01-10T00:00:00.000Z",
  analysis: {
    signalId: 7,
    ativo: "BTCUSDT",
    timeframe: "1h",
    dataAsOf: "2026-01-10T00:00:00.000Z",
    referencePrice: 100000,
    indicators: { vwap: 99900, ema9: 100100, ema21: 99800, rsi: 58, atr: 1200 },
  },
  decision: {
    origem: "jev",
    recomendacao: "BUY",
    tamanhoPosicaoPct: 2,
    confidence: null,
    qualityScore: 0.8,
    riscoElevado: false,
    jevChoice: "ALTA",
    jevProbs: { ALTA: 0.75, BAIXA: 0.2, AGUARDAR: 0.05 },
    jevModelVersion: "jev-1.13",
    observacao: null,
  },
  risk: {
    version: "risk-engine-v1",
    allowed: true,
    positionSizePct: 2,
    maxGrossExposurePct: 20,
    reason: "risk_ok",
    regime: { key: "normal", volatility: "NORMAL" },
  },
  research: { asOf: "2026-01-10T00:00:00.000Z", sentiment: 0, evidence: [], sources: [] },
  report: {
    titulo: "Relatório BTCUSDT 1h",
    resumo: "ok",
    drivers: [],
    riscos: [],
    invalidacao: "reavaliar",
    recomendacao: "BUY",
    confianca: 0.8,
    fonteDecisao: "quantitativo",
  },
} as any;

const storedSnapshot = await repo.saveResearchSnapshot({ snapshot });
assert.equal(storedSnapshot.snapshotId, snapshot.snapshotId);
assert.equal(storedSnapshot.contentHash, snapshot.contentHash);
assert.equal(storedSnapshot.signalId, 7);
assert.equal(storedSnapshot.decisionLogId, null);
assert.equal(storedSnapshot.snapshot.snapshotId, snapshot.snapshotId);

const loadedSnapshot = await repo.getResearchSnapshot(snapshot.snapshotId);
assert.ok(loadedSnapshot);
assert.equal(loadedSnapshot?.contentHash, snapshot.contentHash);
assert.equal(loadedSnapshot?.signalId, 7);
await assert.rejects(repo.getResearchSnapshot(""), /snapshotId is required/);

const signalId = await repo.saveSignal({
  backtestRunId: runId,
  ativo: "BTCUSDT",
  timeframe: "1h",
  decision,
  entrada: 100000,
  stop: 98000,
  alvo: 104000,
});
assert.equal(signalId, 7);
assert.match(db.queries.find((q) => q.includes("INSERT INTO signals")) ?? "", /backtest_run_id/);

const tradeId = await repo.saveTrade({
  signalId,
  entryPrice: 100000,
  exitPrice: 104000,
  outcome: "win",
  profitPercent: 3.8,
  drawdown: 0.4,
});
assert.equal(tradeId, 7);

await repo.freezeConfigThresholds("user-1");
assert.match(db.queries.find((q) => q.includes("INSERT INTO config")) ?? "", /ON CONFLICT/);

const expectedMetrics = [
  {
    origem: "jev",
    total: 2,
    total_trades: 3,
    closed_trades: 2,
    open_trades: 1,
    win_rate: 50,
    profit_factor: 1.25,
    total_profit_percent: 1.5,
    avg_profit_percent: 0.75,
    expectancy_percent: 0.75,
    max_drawdown_percent: 0.5,
    gross_total_profit_percent: 1.9,
    total_fee_percent: 0.2,
    total_slippage_percent: 0.1,
    avg_candles_held: 4,
  },
];

const metricsWithRunId = await repo.getMetricsByOrigem(runId);
assert.deepEqual(metricsWithRunId, expectedMetrics);
assert.equal(metricsWithRunId[0].total_trades, metricsWithRunId[0].closed_trades + metricsWithRunId[0].open_trades);
assert.equal(metricsWithRunId[0].closed_trades, 2);
assert.equal(metricsWithRunId[0].open_trades, 1);
assert.equal(metricsWithRunId[0].win_rate, 50);
assert.equal(metricsWithRunId[0].profit_factor, 1.25);

const saved = await repo.saveMarketData("BTCUSDT", "1h", [{
  openTime: new Date("2026-01-01T00:00:00Z"),
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 10,
}]);
assert.equal(saved, 1);
assert.deepEqual(await repo.getMetricsByOrigem(), expectedMetrics);

const rangeKlines = await repo.getMarketDataRange(
  "BTCUSDT",
  "1h",
  new Date("2026-01-01T00:00:00Z"),
  new Date("2026-01-10T00:00:00Z"),
);
assert.equal(rangeKlines.length, 1);
assert.equal(rangeKlines[0].close, 105);

assert.equal(await repo.health(), true);

const invalid = repo.getMarketData("BTCUSDT", "1h", 0);
await assert.rejects(invalid, /limit must be an integer/);

console.log("repository tests: PASS");
