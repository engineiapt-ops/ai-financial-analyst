# DB Schema Alignment — PR #58

## Objective

Correct production schema drift in `research_snapshots.decision_log_id`.

The repository contract already defines this field as `BIGINT`, referencing
`decision_log(id)`. Production currently exposes a `TEXT = INTEGER` comparison
failure in the operational-quality and system-validation paths.

## Scope

- Convert `research_snapshots.decision_log_id` to `BIGINT`.
- Restore the foreign-key relationship to `decision_log(id)`.
- Preserve existing valid data.
- Fail the migration before the type change if invalid or orphaned references exist.
- Recreate the lookup index.

## Guardrails

This PR does **not** change:

- Decision Engine behavior.
- Strategy logic.
- Thresholds.
- Position sizing.
- Risk limits.
- Paper execution.
- Real-order execution.
- AI/JEV/JEVY/Gemini behavior.

## Execution order

1. Merge PR #58.
2. Run `npm run db:migrate` against the production `DATABASE_URL`.
3. Confirm migration `018_align_research_snapshot_decision_log_type.sql` is recorded.
4. Redeploy production if required by the deployment workflow.
5. Re-run:
   - `/api/evaluation/operational-quality`
   - `/api/system/validation`
   - `/health`
6. Only after these checks pass, continue to controlled paper-trading validation.

## Safety behavior

The migration is transactional through the existing migration runner. PostgreSQL recommends using a `USING` expression for non-implicit type conversions and notes that constraints may need to be dropped and recreated when changing a column type. This migration follows that pattern.
