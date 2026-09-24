import assert from "node:assert/strict";
import { createRepository, type RepositoryPool } from "./repository.js";
import type { DecisionResult } from "../types.js";

class FakeClient {
  queries: string[] = [];
  async query<T = any>(text: string, _values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(text);
    if (text.includes("INSERT INTO market_data")) return { rows: [] };
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
    if (text.includes("GROUP BY s.origem")) {
      return { rows: [{ origem: "jev", total: 2, win_rate: 50, profit_factor: 1.25 }] } as { rows: T[] };
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

const runId = await repo.createBacktestRun({
  engine: "baseline",
  mode: "oos",
  ativo: "BTCUSDT",
  timeframe: "1h",
  periodoInicio: new Date("2026-01-01T00:00:00Z"),
  periodoFim: new Date("2026-01-10T00:00:00Z"),
  oosStartRatio: 0.7,
  thresholdsCongeladosEm: new Date("2026-01-10T00:00:00Z"),
});
assert.equal(runId, 7);

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

assert.deepEqual(await repo.getMetricsByOrigem(runId), [
  { origem: "jev", total: 2, win_rate: 50, profit_factor: 1.25 },
]);

const saved = await repo.saveMarketData("BTCUSDT", "1h", [{
  openTime: new Date("2026-01-01T00:00:00Z"),
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 10,
}]);
assert.equal(saved, 1);
assert.deepEqual(await repo.getMetricsByOrigem(), [
  { origem: "jev", total: 2, win_rate: 50, profit_factor: 1.25 },
]);
assert.equal(await repo.health(), true);

const invalid = repo.getMarketData("BTCUSDT", "1h", 0);
await assert.rejects(invalid, /limit must be an integer/);

console.log("repository tests: PASS");
