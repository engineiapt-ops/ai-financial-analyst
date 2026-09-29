-- Align the production schema with db/schema.sql and db/migrations/010_research_snapshots.sql.
-- This migration is intentionally fail-fast: invalid/nonexistent decision_log references
-- must be repaired before the production schema is changed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM research_snapshots
    WHERE decision_log_id IS NOT NULL
      AND BTRIM(decision_log_id::text) !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION
      'research_snapshots.decision_log_id contains non-numeric values; migration aborted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM research_snapshots rs
    WHERE rs.decision_log_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM decision_log dl
        WHERE dl.id = BTRIM(rs.decision_log_id::text)::BIGINT
      )
  ) THEN
    RAISE EXCEPTION
      'research_snapshots.decision_log_id contains references to missing decision_log rows; migration aborted';
  END IF;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'research_snapshots'::regclass
      AND a.attname = 'decision_log_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE research_snapshots DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE research_snapshots
  ALTER COLUMN decision_log_id TYPE BIGINT
  USING BTRIM(decision_log_id::text)::BIGINT;

ALTER TABLE research_snapshots
  ADD CONSTRAINT research_snapshots_decision_log_id_fkey
  FOREIGN KEY (decision_log_id)
  REFERENCES decision_log(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_research_snapshots_decision_log
  ON research_snapshots(decision_log_id);
