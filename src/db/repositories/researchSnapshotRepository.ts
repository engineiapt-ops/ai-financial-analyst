import {
  createRepository,
  getPool,
  type RepositoryPool,
} from "../repository.js";
import type { ResearchSnapshotRepository } from "../ports/researchSnapshotRepository.js";

/**
 * SQL-backed adapter for the research snapshot persistence port.
 *
 * Keeping the adapter narrow prevents callers from gaining access to the
 * monolithic repository surface while preserving the current persistence
 * implementation and behavior.
 */
export function createResearchSnapshotRepository(
  db: RepositoryPool,
): ResearchSnapshotRepository {
  const repository = createRepository(db);

  return {
    saveResearchSnapshot: repository.saveResearchSnapshot,
  };
}

/**
 * Transitional default adapter used by the application composition layer.
 *
 * The underlying pool remains lazy, matching the current repository behavior.
 */
let defaultRepository: ResearchSnapshotRepository | null = null;

export function getDefaultResearchSnapshotRepository(): ResearchSnapshotRepository {
  if (!defaultRepository) {
    defaultRepository = createResearchSnapshotRepository(getPool());
  }
  return defaultRepository;
}

export async function saveResearchSnapshot(
  input: Parameters<ResearchSnapshotRepository["saveResearchSnapshot"]>[0],
): ReturnType<ResearchSnapshotRepository["saveResearchSnapshot"]> {
  return getDefaultResearchSnapshotRepository().saveResearchSnapshot(input);
}
