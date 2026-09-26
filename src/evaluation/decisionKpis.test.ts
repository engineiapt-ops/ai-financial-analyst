import assert from "node:assert/strict";
import { createRepository, type RepositoryPool } from "../db/repository.js";

class FakeDb implements RepositoryPool {
  calls: Array<{ sql: string; values: unknown[] | undefined }> = [];

  async query<T = any>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ sql, values });

    if (sql.includes("GROUP BY origem, ativo, timeframe, recomendacao, risk_regime")) {
      return {
        rows: [{
          origem: "baseline",
          ativo: "BTCUSDT",
          timeframe: "1h",
          recomendacao: "BUY",
          risk_regime: "normal",
          total_decisions: "4",
          settled_decisions: "3",
          pending_decisions: "1",
          not_applicable_decisions: "0",
          profitable_decisions: "2",
          losing_decisions: "1",
          flat_decisions: "0",
          win_rate: "66.67",
          avg_forward_return_percent: "0.75",
          avg_trade_profit_percent: "0.75",
          total_trade_profit_percent: "2.25",
          avg_confidence: "0.72",
          avg_quality_score: "0.81",
          risk_elevated_decisions: "1",
          buy_decisions: "4",
          sell_decisions: "0",
          wait_decisions: "0",
        }],
      } as { rows: T[] };
    }

    return {
      rows: [{
        total_decisions: "4",
        settled_decisions: "3",
        pending_decisions: "1",
        not_applicable_decisions: "0",
        profitable_decisions: "2",
        losing_decisions: "1",
        flat_decisions: "0",
        win_rate: "66.67",
        avg_forward_return_percent: "0.75",
        avg_trade_profit_percent: "0.75",
        total_trade_profit_percent: "2.25",
        avg_confidence: "0.72",
        avg_quality_score: "0.81",
        risk_elevated_decisions: "1",
        buy_decisions: "4",
        sell_decisions: "0",
        wait_decisions: "0",
      }],
    } as { rows: T[] };
  }

  async connect(): Promise<any> {
    throw new Error("connect is not used in KPI tests");
  }
}

const db = new FakeDb();
const repo = createRepository(db);

const from = new Date("2026-09-01T00:00:00Z");
const to = new Date("2026-09-26T00:00:00Z");

const result = await repo.getDecisionKpis({
  ativo: "BTCUSDT",
  timeframe: "1h",
  origem: "baseline",
  recomendacao: "BUY",
  riskRegime: "normal",
  from,
  to,
});

assert.equal(result.summary.totalDecisions, 4);
assert.equal(result.summary.settledDecisions, 3);
assert.equal(result.summary.winRate, 66.67);
assert.equal(result.summary.totalTradeProfitPercent, 2.25);
assert.equal(result.summary.avgConfidence, 0.72);
assert.equal(result.breakdown.length, 1);
assert.equal(result.breakdown[0]?.riskRegime, "normal");
assert.equal(result.breakdown[0]?.recomendacao, "BUY");

const kpiQueries = db.calls;
assert.equal(kpiQueries.length, 2);
assert.match(kpiQueries[0]?.sql ?? "", /research_snapshots/);
assert.match(kpiQueries[0]?.sql ?? "", /risk_regime/);
assert.deepEqual(kpiQueries[0]?.values, [
  "BTCUSDT",
  "1h",
  "baseline",
  "BUY",
  from,
  to,
  "normal",
]);

console.log("decision KPI tests passed");
