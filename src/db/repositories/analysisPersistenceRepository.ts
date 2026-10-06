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
    saveSignal: (ativo, timeframe, decision, levels) =>
      repository.saveSignal({ ativo, timeframe, decision, ...levels }),
    saveDecisionLog: repository.saveDecisionLog,
    saveMarketData: repository.saveMarketData,
  };
}

let defaultRepository: AnalysisPersistenceRepository | null = null;

function resolveDefaultRepository(): AnalysisPersistenceRepository {
  if (!defaultRepository) {
    defaultRepository = createAnalysisPersistenceRepository(getPool());
  }
  return defaultRepository;
}

export const defaultAnalysisPersistenceRepository: AnalysisPersistenceRepository = {
  saveSignal: (ativo, timeframe, decision, levels) =>
    resolveDefaultRepository().saveSignal(ativo, timeframe, decision, levels),
  saveDecisionLog: (input) => resolveDefaultRepository().saveDecisionLog(input),
  saveMarketData: (ativo, timeframe, klines) =>
    resolveDefaultRepository().saveMarketData(ativo, timeframe, klines),
};

export function getDefaultAnalysisPersistenceRepository(): AnalysisPersistenceRepository {
  return defaultAnalysisPersistenceRepository;
}
