import type {
  DecisionLogInput,
  SaveSignalInput,
  RepositoryPool,
} from "../repository.js";
import type { DecisionResult, Kline, Timeframe } from "../../types.js";

export interface AnalysisPersistenceRepository {
  saveSignal(
    ativo: string,
    timeframe: Timeframe,
    decision: DecisionResult,
    levels?: Pick<SaveSignalInput, "entrada" | "stop" | "alvo">,
  ): Promise<number>;

  saveDecisionLog(input: DecisionLogInput): Promise<number>;

  saveMarketData(
    ativo: string,
    timeframe: Timeframe,
    klines: Kline[],
  ): Promise<number>;
}

export type { RepositoryPool };
