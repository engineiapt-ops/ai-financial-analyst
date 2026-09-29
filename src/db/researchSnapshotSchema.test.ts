import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "db",
  "migrations",
  "018_align_research_snapshot_decision_log_type.sql",
);

const sql = await readFile(migrationPath, "utf8");

const requiredFragments = [
  "ALTER COLUMN decision_log_id TYPE BIGINT",
  "USING BTRIM(decision_log_id::text)::BIGINT",
  "research_snapshots_decision_log_id_fkey",
  "REFERENCES decision_log(id)",
  "contains non-numeric values; migration aborted",
  "contains references to missing decision_log rows; migration aborted",
];

for (const fragment of requiredFragments) {
  if (!sql.includes(fragment)) {
    throw new Error(
      `Migration regression guard failed: missing fragment: ${fragment}`,
    );
  }
}

console.log("DB schema alignment migration regression guard: PASS");
