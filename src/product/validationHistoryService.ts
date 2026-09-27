import {
  listSystemValidationSnapshots,
  saveSystemValidationSnapshot,
  type SystemValidationSnapshotRecord,
} from "../db/repository.js";
import { buildSystemValidationForScope } from "./systemValidationService.js";
import {
  buildValidationHistoryOverview,
  type ValidationHistoryOverview,
} from "./validationHistory.js";
import type { Timeframe } from "../types.js";

export async function buildValidationHistoryForScope(input: {
  asset?: string;
  timeframe?: Timeframe;
  fromRun?: number;
  limit?: number;
  generatedAt?: Date;
}): Promise<ValidationHistoryOverview> {
  const generatedAt = input.generatedAt ?? new Date();
  const asset = input.asset?.trim().toUpperCase() || "BTCUSDT";
  const timeframe = input.timeframe ?? "1h";
  const snapshots = await listSystemValidationSnapshots({
    ativo: asset,
    timeframe,
    fromRun: input.fromRun,
    limit: input.limit ?? 20,
  });

  return buildValidationHistoryOverview({
    generatedAt,
    asset,
    timeframe,
    fromRun: input.fromRun,
    snapshots,
  });
}

export async function recordValidationSnapshotForScope(input: {
  asset?: string;
  timeframe?: Timeframe;
  lookbackDays?: number;
  limit?: number;
  fromRun?: number;
  generatedAt?: Date;
}): Promise<{
  snapshot: SystemValidationSnapshotRecord;
  history: ValidationHistoryOverview;
}> {
  const validation = await buildSystemValidationForScope(input);
  const asset = validation.scope.asset;
  const timeframe = validation.scope.timeframe;

  const snapshot = await saveSystemValidationSnapshot({
    snapshot: validation,
  });

  const snapshots = await listSystemValidationSnapshots({
    ativo: asset,
    timeframe,
    fromRun: input.fromRun,
    limit: input.limit ?? 20,
  });

  return {
    snapshot,
    history: buildValidationHistoryOverview({
      generatedAt: input.generatedAt ?? new Date(),
      asset,
      timeframe,
      fromRun: input.fromRun,
      snapshots,
    }),
  };
}
