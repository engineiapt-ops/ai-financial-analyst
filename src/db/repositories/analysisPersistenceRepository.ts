import {
  createRepository,
  getPool,
  type RepositoryPool,
} from "../repository.js";
import type { AnalysisPersistenceRepository } from "../ports/analysisPersistenceRepository.js";

export function createAnalysisPersistenceRepository(
  db: RepositoryPool,
): AnalysisPersistenceRepository {
  const repository = createRepository(db);

  return {
    saveSignal: repository.saveSignal,
    saveDecisionLog: repository.saveDecisionLog,
    saveMarketData: repository.saveMarketData,
  };
}

let defaultRepository: AnalysisPersistenceRepository | null = null;

export function getDefaultAnalysisPersistenceRepository(): AnalysisPersistenceRepository {
  if (!defaultRepository) {
    defaultRepository = createAnalysisPersistenceRepository(getPool());
  }
  return defaultRepository;
}
