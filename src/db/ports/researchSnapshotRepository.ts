import type {
  ResearchSnapshotRecord,
  SaveResearchSnapshotInput,
} from "../repository.js";

/**
 * Application-facing persistence contract for research snapshots.
 *
 * The application layer depends on this port rather than on the SQL-backed
 * repository implementation. The repository implementation remains the
 * infrastructure adapter for now; DTO extraction is intentionally deferred
 * to the domain-types phase to keep this PR behavior-neutral.
 */
export interface ResearchSnapshotRepository {
  saveResearchSnapshot(
    input: SaveResearchSnapshotInput,
  ): Promise<ResearchSnapshotRecord>;
}
