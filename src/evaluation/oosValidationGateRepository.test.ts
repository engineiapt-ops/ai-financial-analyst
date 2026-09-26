import { strict as assert } from "node:assert";
import type { RepositoryPool } from "../db/repository.js";
import { createRepository } from "../db/repository.js";
import type { OosValidationGate } from "./oosValidationGate.js";

const gate: OosValidationGate = {
  gateVersion: "oos-validation-gate.v1",
  status: "ready",
  strategy: "baseline",
  generatedAt: "2026-09-26T00:00:00.000Z",
  scope: {
    backtestRunId: 10,
    walkForwardRunId: 20,
    ativo: "BTCUSDT",
    timeframe: "1h",
    validationFrom: "2026-08-01T00:00:00.000Z",
    validationTo: "2026-09-01T00:00:00.000Z",
  },
  checks: [],
  blockingReasons: [],
  advisories: [],
  evidenceHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  interpretation: {
    readyMeans: "ready for engineering continuation",
    notAnInvestmentVerdict: true,
  },
};

class FakeDb implements RepositoryPool {
  queries: string[] = [];

  async query<T = any>(text: string, _values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(text);

    if (text.includes("INSERT INTO oos_validation_gate_audits")) {
      return {
        rows: [{
          id: 17,
          backtest_run_id: 10,
          walk_forward_run_id: 20,
          ativo: "BTCUSDT",
          timeframe: "1h",
          estrategia: "baseline",
          gate_version: "oos-validation-gate.v1",
          status: "ready",
          validation_from: new Date("2026-08-01T00:00:00Z"),
          validation_to: new Date("2026-09-01T00:00:00Z"),
          evidence_hash: gate.evidenceHash,
          created_at: new Date("2026-09-26T00:00:00Z"),
          gate,
        }],
      } as { rows: T[] };
    }

    if (text.includes("FROM oos_validation_gate_audits") && text.includes("ORDER BY created_at DESC")) {
      return {
        rows: [{
          id: 17,
          backtest_run_id: 10,
          walk_forward_run_id: 20,
          ativo: "BTCUSDT",
          timeframe: "1h",
          estrategia: "baseline",
          gate_version: "oos-validation-gate.v1",
          status: "ready",
          validation_from: new Date("2026-08-01T00:00:00Z"),
          validation_to: new Date("2026-09-01T00:00:00Z"),
          evidence_hash: gate.evidenceHash,
          created_at: new Date("2026-09-26T00:00:00Z"),
          gate,
        }],
      } as { rows: T[] };
    }

    if (text.includes("FROM oos_validation_gate_audits") && text.includes("WHERE id = $1")) {
      return {
        rows: [{
          id: 17,
          backtest_run_id: 10,
          walk_forward_run_id: 20,
          ativo: "BTCUSDT",
          timeframe: "1h",
          estrategia: "baseline",
          gate_version: "oos-validation-gate.v1",
          status: "ready",
          validation_from: new Date("2026-08-01T00:00:00Z"),
          validation_to: new Date("2026-09-01T00:00:00Z"),
          evidence_hash: gate.evidenceHash,
          created_at: new Date("2026-09-26T00:00:00Z"),
          gate,
        }],
      } as { rows: T[] };
    }

    return { rows: [] } as { rows: T[] };
  }

  async connect() {
    throw new Error("connect is not expected in this test");
  }
}

const db = new FakeDb();
const repo = createRepository(db);

const saved = await repo.saveOosValidationGateAudit({ gate });
assert.equal(saved.id, 17);
assert.equal(saved.backtestRunId, 10);
assert.equal(saved.walkForwardRunId, 20);
assert.equal(saved.evidenceHash, gate.evidenceHash);
assert.equal(saved.gate.status, "ready");
assert.match(
  db.queries.find((query) => query.includes("INSERT INTO oos_validation_gate_audits")) ?? "",
  /ON CONFLICT/,
);

const loaded = await repo.getOosValidationGateAudit(17);
assert.ok(loaded);
assert.equal(loaded?.id, 17);
assert.equal(loaded?.gateVersion, "oos-validation-gate.v1");
assert.equal(loaded?.gate.evidenceHash, gate.evidenceHash);

const history = await repo.listOosValidationGateAudits({
  backtestRunId: 10,
  strategy: "baseline",
  limit: 10,
});
assert.equal(history.length, 1);
assert.equal(history[0]?.evidenceHash, gate.evidenceHash);

await assert.rejects(
  repo.getOosValidationGateAudit(0),
  /audit id must be a positive integer/,
);

await assert.rejects(
  repo.saveOosValidationGateAudit({
    ...({ gate: { ...gate, evidenceHash: "invalid" } } as const),
  }),
  /evidenceHash must be a 64-character lowercase SHA-256 hex string/,
);

console.log("oos gate audit repository tests passed");
