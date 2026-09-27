import { strict as assert } from "node:assert";
import {
  buildValidationHistoryOverview,
  VALIDATION_HISTORY_VERSION,
  type ValidationHistorySnapshotRecord,
} from "./validationHistory.js";
import type { SystemValidationOverview } from "./systemValidation.js";

const base = {
  version: "system-validation.v1",
  generatedAt: "2026-09-27T09:00:00.000Z",
  state: "ready",
  scope: {
    asset: "BTCUSDT",
    timeframe: "1h" as const,
    fromRun: 41,
    lookbackDays: 30,
  },
  summary: {
    readyCount: 8,
    degradedCount: 2,
    blockedCount: 0,
    blockingFailures: 0,
  },
  checks: [],
  contracts: ["system-validation.v1"],
  evidenceHash: "a".repeat(64),
  interpretation: {
    readyMeans: "ready",
    blockedMeans: "blocked",
    notAnInvestmentVerdict: true as const,
  },
  notes: [],
} as unknown as SystemValidationOverview;

function record(
  id: number,
  at: string,
  state: "ready" | "degraded" | "blocked",
  evidenceHash: string,
  blockingFailures: number,
): ValidationHistorySnapshotRecord {
  return {
    id,
    generatedAt: new Date(at),
    createdAt: new Date(at),
    ativo: "BTCUSDT",
    timeframe: "1h",
    fromRun: 41,
    lookbackDays: 30,
    state,
    readyCount: state === "ready" ? 8 : 7,
    degradedCount: state === "blocked" ? 1 : 2,
    blockedCount: state === "blocked" ? 1 : 0,
    blockingFailures,
    evidenceHash,
    snapshot: {
      ...base,
      generatedAt: at,
      state,
      summary: {
        ...base.summary,
        blockingFailures,
        readyCount: state === "ready" ? 8 : 7,
        degradedCount: state === "blocked" ? 1 : 2,
        blockedCount: state === "blocked" ? 1 : 0,
      },
      evidenceHash,
    },
  };
}

const first = record(1, "2026-09-27T09:00:00.000Z", "ready", "a".repeat(64), 0);
const second = record(2, "2026-09-27T10:00:00.000Z", "degraded", "b".repeat(64), 0);
const third = record(3, "2026-09-27T11:00:00.000Z", "blocked", "c".repeat(64), 2);

const overview = buildValidationHistoryOverview({
  generatedAt: new Date("2026-09-27T11:00:00.000Z"),
  asset: "BTCUSDT",
  timeframe: "1h",
  fromRun: 41,
  snapshots: [third, first, second],
});

assert.equal(overview.version, VALIDATION_HISTORY_VERSION);
assert.equal(overview.count, 3);
assert.equal(overview.current?.snapshotId, 3);
assert.equal(overview.history[0]?.evidenceHash, "c".repeat(64));
assert.equal(overview.checks.temporalOrderValid, true);
assert.equal(overview.checks.evidenceHashesValid, true);
assert.equal(overview.checks.scopeConsistent, true);
assert.ok(overview.timeline.some((event) => event.kind === "state-change"));
assert.ok(overview.timeline.some((event) => event.kind === "blocking-failures-change"));
assert.ok(overview.timeline.some((event) => event.kind === "evidence-change"));

console.log("validation history tests passed");
