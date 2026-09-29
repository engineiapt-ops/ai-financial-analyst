import assert from "node:assert/strict";
import { createRepository, type RepositoryPool } from "../db/repository.js";
import type { PipelineAuditOverview } from "./pipelineAudit.js";

const hash = "a".repeat(64);
const evidenceHash = "b".repeat(64);

const snapshot: PipelineAuditOverview = {
  version: "pipeline-audit.v1",
  generatedAt: "2026-09-27T10:00:00.000Z",
  state: "ready",
  scope: {
    walkForwardRunId: 41,
    asset: "BTCUSDT",
    timeframe: "1h",
    datasetHash: hash,
    candlesTotal: 1000,
  },
  traceability: {
    dataset: { present: true, hash, candlesTotal: 1000 },
    oos: { auditCount: 2, latestByStrategy: [], requiredStrategies: [] },
    portfolio: {
      available: true,
      walkForwardRunId: 41,
      datasetHash: hash,
      foldCount: 5,
      stabilityCoveragePct: 100,
      contractVersion: "portfolio-governance-overview.v2",
    },
    product: {
      operationalQualityVersion: "operational-quality.v1",
      operationalQualityState: "ready",
    },
  },
  checks: [],
  blockingReasons: [],
  warnings: [],
  evidenceHash,
  interpretation: {
    readyMeans: "traceable",
    notAnInvestmentVerdict: true,
  },
};

const row = {
  id: 9,
  walk_forward_run_id: 41,
  ativo: "BTCUSDT",
  timeframe: "1h" as const,
  dataset_hash: hash,
  audit_version: "pipeline-audit.v1",
  state: "ready" as const,
  operational_quality_state: "ready" as const,
  evidence_hash: evidenceHash,
  created_at: new Date("2026-09-27T10:00:00.000Z"),
  snapshot,
};

class FakeDb implements RepositoryPool {
  async query<T = any>(text: string, _values?: unknown[]): Promise<{ rows: T[] }> {
    if (text.includes("INSERT INTO pipeline_audit_snapshots")) {
      return { rows: [row as T] };
    }
    if (text.includes("FROM pipeline_audit_snapshots")) {
      return { rows: [row as T] };
    }
    return { rows: [] };
  }

  async connect() {
    return {
      query: async <T = any>(text: string, values?: unknown[]) => this.query<T>(text, values),
      release() {},
    } as any;
  }
}

const repo = createRepository(new FakeDb());

const saved = await repo.savePipelineAuditSnapshot({ snapshot });
assert.equal(saved.id, 9);
assert.equal(saved.walkForwardRunId, 41);
assert.equal(saved.evidenceHash, evidenceHash);
assert.equal(saved.snapshot.version, "pipeline-audit.v1");

const fetched = await repo.getPipelineAuditSnapshot(9);
assert.ok(fetched);
assert.equal(fetched?.snapshot.scope.datasetHash, hash);

const listed = await repo.listPipelineAuditSnapshots({
  walkForwardRunId: 41,
  ativo: "btcusdt",
  timeframe: "1h",
  limit: 2,
});
assert.equal(listed.length, 1);
assert.equal(listed[0]?.state, "ready");

await assert.rejects(
  () =>
    repo.savePipelineAuditSnapshot({
      snapshot: {
        ...snapshot,
        evidenceHash: "invalid",
      },
    }),
  /evidenceHash/,
);

console.log("pipeline audit repository tests passed");
