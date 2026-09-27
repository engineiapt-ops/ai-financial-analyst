import {
  getMarketDataRange,
  getPendingDecisionLogs,
  settleDecisionLog,
  type DecisionLogRecord,
  type PendingDecisionLogFilters,
} from "../db/repository.js";
import { evaluateDecisionLog, type DecisionEvaluationConfig } from "./decisionEvaluator.js";
import type { Kline, Timeframe } from "../types.js";

export interface PendingSettlementOptions {
  limit?: number;
  ativo?: string;
  timeframe?: Timeframe;
  lookaheadCandles?: number;
  flatThresholdPct?: number;
  evaluatedAt?: Date;
}

export interface PendingSettlementResult {
  scanned: number;
  settled: number;
  notReady: number;
  failed: number;
  results: Array<{
    decisionLogId: number;
    status: "settled" | "not_ready" | "failed";
    outcomeStatus?: "settled" | "not_applicable";
    evaluatedAt?: string;
    error?: string;
  }>;
}

export interface PendingSettlementDependencies {
  listPending: (
    filters?: PendingDecisionLogFilters,
  ) => Promise<DecisionLogRecord[]>;
  getCandles: (
    ativo: string,
    timeframe: Timeframe,
    startTime: Date,
    endTime: Date,
  ) => Promise<Kline[]>;
  settle: (
    id: number,
    outcome: ReturnType<typeof evaluateDecisionLog>["outcome"],
  ) => Promise<void>;
  evaluate: typeof evaluateDecisionLog;
  now: () => Date;
}

const defaultDependencies: PendingSettlementDependencies = {
  listPending: getPendingDecisionLogs,
  getCandles: getMarketDataRange,
  settle: settleDecisionLog,
  evaluate: evaluateDecisionLog,
  now: () => new Date(),
};

function validateOptions(options: PendingSettlementOptions): void {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  const lookaheadCandles = options.lookaheadCandles ?? 24;
  if (
    !Number.isInteger(lookaheadCandles) ||
    lookaheadCandles < 1 ||
    lookaheadCandles > 5000
  ) {
    throw new Error("lookaheadCandles must be an integer between 1 and 5000");
  }

  const flatThresholdPct = options.flatThresholdPct ?? 0.1;
  if (
    !Number.isFinite(flatThresholdPct) ||
    flatThresholdPct < 0 ||
    flatThresholdPct > 100
  ) {
    throw new Error("flatThresholdPct must be between 0 and 100");
  }

  if (options.evaluatedAt && Number.isNaN(options.evaluatedAt.getTime())) {
    throw new Error("evaluatedAt must be a valid date");
  }
}

function groupKey(decision: DecisionLogRecord): string {
  return `${decision.ativo}::${decision.timeframe}`;
}

export async function settlePendingDecisionLogs(
  options: PendingSettlementOptions = {},
  dependencies: PendingSettlementDependencies = defaultDependencies,
): Promise<PendingSettlementResult> {
  validateOptions(options);

  const evaluatedAt = options.evaluatedAt ?? dependencies.now();
  const lookaheadCandles = options.lookaheadCandles ?? 24;
  const flatThresholdPct = options.flatThresholdPct ?? 0.1;

  const pending = await dependencies.listPending({
    ativo: options.ativo ?? null,
    timeframe: options.timeframe ?? null,
    limit: options.limit ?? 100,
  });

  const candlesByGroup = new Map<string, Kline[]>();
  const startByGroup = new Map<string, Date>();

  for (const decision of pending) {
    const key = groupKey(decision);
    const currentStart = startByGroup.get(key);
    if (!currentStart || decision.dataAsOf.getTime() < currentStart.getTime()) {
      startByGroup.set(key, decision.dataAsOf);
    }
  }

  for (const [key, start] of startByGroup) {
    const separator = key.lastIndexOf("::");
    const ativo = key.slice(0, separator);
    const timeframe = key.slice(separator + 2) as Timeframe;
    candlesByGroup.set(
      key,
      await dependencies.getCandles(ativo, timeframe, start, evaluatedAt),
    );
  }

  const config: DecisionEvaluationConfig = {
    lookaheadCandles,
    flatThresholdPct,
  };

  let settled = 0;
  let notReady = 0;
  let failed = 0;
  const results: PendingSettlementResult["results"] = [];

  for (const decision of pending) {
    try {
      const evaluation = dependencies.evaluate(
        decision,
        candlesByGroup.get(groupKey(decision)) ?? [],
        evaluatedAt,
        config,
      );

      await dependencies.settle(decision.id, evaluation.outcome);
      settled += 1;
      results.push({
        decisionLogId: decision.id,
        status: "settled",
        outcomeStatus: evaluation.outcome.outcomeStatus,
        evaluatedAt: evaluation.outcome.evaluatedAt?.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Insufficient future closed candles")) {
        notReady += 1;
        results.push({
          decisionLogId: decision.id,
          status: "not_ready",
          error: message,
        });
      } else {
        failed += 1;
        results.push({
          decisionLogId: decision.id,
          status: "failed",
          error: message,
        });
      }
    }
  }

  return {
    scanned: pending.length,
    settled,
    notReady,
    failed,
    results,
  };
}
