import type { Kline, Recomendacao } from "../types.js";
import type { DecisionLogRecord, DecisionLogOutcome } from "../db/repository.js";

export interface DecisionEvaluationConfig {
  lookaheadCandles: number;
  flatThresholdPct: number;
}

export interface DecisionEvaluation {
  decisionLogId: number;
  referencePrice: number;
  evaluationCandleClose: Date;
  evaluationPrice: number;
  lookaheadCandles: number;
  forwardReturnPercent: number;
  outcomeDirection: "up" | "down" | "flat";
  tradeProfitPercent: number | null;
  outcome: DecisionLogOutcome;
}

function validateConfig(config: DecisionEvaluationConfig): void {
  if (!Number.isInteger(config.lookaheadCandles) || config.lookaheadCandles < 1 || config.lookaheadCandles > 5000) {
    throw new Error("lookaheadCandles must be an integer between 1 and 5000");
  }
  if (!Number.isFinite(config.flatThresholdPct) || config.flatThresholdPct < 0 || config.flatThresholdPct > 100) {
    throw new Error("flatThresholdPct must be between 0 and 100");
  }
}

function futureClosedCandles(
  candles: Kline[],
  dataAsOf: Date,
  evaluatedAt: Date,
): Kline[] {
  return candles
    .filter((candle) => {
      const closeTime = candle.closeTime ?? candle.openTime;
      return candle.openTime.getTime() > dataAsOf.getTime() &&
        closeTime.getTime() <= evaluatedAt.getTime();
    })
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
}

function classifyDirection(
  forwardReturnPercent: number,
  flatThresholdPct: number,
): "up" | "down" | "flat" {
  if (forwardReturnPercent > flatThresholdPct) return "up";
  if (forwardReturnPercent < -flatThresholdPct) return "down";
  return "flat";
}

function tradeProfit(
  recommendation: Recomendacao,
  forwardReturnPercent: number,
): number | null {
  if (recommendation === "BUY") return forwardReturnPercent;
  if (recommendation === "SELL") return -forwardReturnPercent;
  return null;
}

export function evaluateDecisionLog(
  decision: DecisionLogRecord,
  candles: Kline[],
  evaluatedAt: Date,
  config: DecisionEvaluationConfig,
): DecisionEvaluation {
  validateConfig(config);

  if (!(evaluatedAt instanceof Date) || Number.isNaN(evaluatedAt.getTime())) {
    throw new Error("evaluatedAt must be a valid date");
  }
  if (!(decision.dataAsOf instanceof Date) || Number.isNaN(decision.dataAsOf.getTime())) {
    throw new Error("decision dataAsOf must be a valid date");
  }
  if (!Number.isFinite(decision.referencePrice) || decision.referencePrice <= 0) {
    throw new Error("decision referencePrice must be greater than zero");
  }
  if (evaluatedAt.getTime() <= decision.dataAsOf.getTime()) {
    throw new Error("evaluatedAt must be after decision dataAsOf");
  }

  const future = futureClosedCandles(candles, decision.dataAsOf, evaluatedAt);
  const target = future[config.lookaheadCandles - 1];
  if (!target) {
    throw new Error("Insufficient future closed candles for requested lookahead");
  }

  const forwardReturnPercent =
    ((target.close - decision.referencePrice) / decision.referencePrice) * 100;
  const outcomeDirection = classifyDirection(forwardReturnPercent, config.flatThresholdPct);
  const tradeProfitPercent = tradeProfit(decision.recomendacao, forwardReturnPercent);

  return {
    decisionLogId: decision.id,
    referencePrice: decision.referencePrice,
    evaluationCandleClose: target.closeTime ?? target.openTime,
    evaluationPrice: target.close,
    lookaheadCandles: config.lookaheadCandles,
    forwardReturnPercent,
    outcomeDirection,
    tradeProfitPercent,
    outcome: {
      outcomeStatus: decision.recomendacao === "WAIT" ? "not_applicable" : "settled",
      outcomeDirection,
      forwardReturnPercent,
      tradeProfitPercent,
      exitReason: "end",
      evaluatedAt,
    },
  };
}
