import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../db/migrations/018_align_research_snapshot_decision_log_type.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /ALTER COLUMN decision_log_id TYPE BIGINT/);
assert.match(migration, /REFERENCES public\.decision_log\(id\)/);
assert.match(migration, /ON DELETE SET NULL/);
assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_research_snapshots_decision_log/);
assert.match(migration, /contains non-numeric values/);
assert.match(migration, /contains references to missing decision_log rows/);

console.log("research snapshot schema test: PASS");
