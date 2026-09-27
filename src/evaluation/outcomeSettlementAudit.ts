import { createHash } from "node:crypto";
import type { DecisionLogRecord } from "../db/repository.js";
import type { Kline } from "../types.js";
import type { DecisionEvaluation, DecisionEvaluationConfig } from "./decisionEvaluator.js";
import { selectFutureClosedCandles } from "./decisionEvaluator.js";

export const OUTCOME_SETTLEMENT_AUDIT_VERSION = "outcome-settlement-audit.v1";

export interface OutcomeSettlementAuditPayload {
  version: typeof OUTCOME_SETTLEMENT_AUDIT_VERSION;
  decisionLogId: number;
  asset: string;
  timeframe: "1h" | "4h" | "1d";
  recommendation: "BUY" | "WAIT" | "SELL";
  decisionAt: string;
  dataAsOf: string;
  evaluatedAt: string;
  referencePrice: number;
  lookaheadCandles: number;
  flatThresholdPct: number;
  outcomeStatus: "settled" | "not_applicable";
  outcomeDirection: "up" | "down" | "flat";
  forwardReturnPercent: number;
  tradeProfitPercent: number | null;
  exitReason: "target" | "stop" | "end";
  evaluationCandleOpenTime: string;
  evaluationCandleCloseTime: string;
  evaluationPrice: number;
  futureClosedCandleCount: number;
  futureFirstOpenTime: string;
  futureLastCloseTime: string;
  marketDataHash: string;
  evidenceHash: string;
  source: "persisted-market-data";
  notes: string[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((item) => stableJson(item)).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item))
        .join(",") +
      "}";
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function candleEvidence(candle: Kline): Record<string, unknown> {
  return {
    openTime: candle.openTime.toISOString(),
    closeTime: (candle.closeTime ?? candle.openTime).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export function buildOutcomeSettlementAudit(input: {
  decision: DecisionLogRecord;
  candles: Kline[];
  evaluation: DecisionEvaluation;
  evaluatedAt: Date;
  config: DecisionEvaluationConfig;
}): OutcomeSettlementAuditPayload {
  const evaluatedAt = input.evaluatedAt;
  if (!(evaluatedAt instanceof Date) || Number.isNaN(evaluatedAt.getTime())) {
    throw new Error("evaluatedAt must be a valid date");
  }

  const future = selectFutureClosedCandles(
    input.candles,
    input.decision.dataAsOf,
    evaluatedAt,
  );

  if (future.length < input.config.lookaheadCandles) {
    throw new Error("Outcome settlement audit requires the evaluated future candle set");
  }

  const target = future[input.config.lookaheadCandles - 1];
  const evaluationCandleClose = input.evaluation.evaluationCandleClose.toISOString();
  const targetClose = (target.closeTime ?? target.openTime).toISOString();

  if (targetClose !== evaluationCandleClose) {
    throw new Error("Outcome settlement audit target candle does not match decision evaluation");
  }

  const marketDataHash = sha256(
    future.map((candle) => candleEvidence(candle)),
  );

  const withoutEvidenceHash = {
    version: OUTCOME_SETTLEMENT_AUDIT_VERSION,
    decisionLogId: input.decision.id,
    asset: input.decision.ativo.toUpperCase(),
    timeframe: input.decision.timeframe,
    recommendation: input.decision.recomendacao,
    decisionAt: input.decision.decisionAt.toISOString(),
    dataAsOf: input.decision.dataAsOf.toISOString(),
    evaluatedAt: evaluatedAt.toISOString(),
    referencePrice: input.evaluation.referencePrice,
    lookaheadCandles: input.config.lookaheadCandles,
    flatThresholdPct: input.config.flatThresholdPct,
    outcomeStatus: input.evaluation.outcome.outcomeStatus,
    outcomeDirection: input.evaluation.outcomeDirection,
    forwardReturnPercent: input.evaluation.forwardReturnPercent,
    tradeProfitPercent: input.evaluation.tradeProfitPercent,
    exitReason: input.evaluation.outcome.exitReason ?? "end",
    evaluationCandleOpenTime: target.openTime.toISOString(),
    evaluationCandleCloseTime: targetClose,
    evaluationPrice: input.evaluation.evaluationPrice,
    futureClosedCandleCount: future.length,
    futureFirstOpenTime: future[0].openTime.toISOString(),
    futureLastCloseTime: (
      future[future.length - 1].closeTime ?? future[future.length - 1].openTime
    ).toISOString(),
    marketDataHash,
    source: "persisted-market-data" as const,
  };

  return {
    ...withoutEvidenceHash,
    evidenceHash: sha256(withoutEvidenceHash),
    notes: [
      "Settlement is derived only from persisted market data and the deterministic decision evaluator.",
      "The market-data hash covers the exact closed-candle set used by evaluation.",
      "This audit is immutable and does not authorize or execute a trade.",
    ],
  };
}
