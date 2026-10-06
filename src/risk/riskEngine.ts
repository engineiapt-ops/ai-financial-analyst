import { FIXED_POSITION_PCT } from "../config/thresholds.js";
import type { DecisionResult, Recomendacao } from "../domain/trading.js";
import type { RegimeSnapshot } from "./regime.js";

export const RISK_ENGINE_VERSION = "risk-engine-v2";
export const RISK_MAX_GROSS_EXPOSURE_PCT = 15;
export const RISK_POSITION_SIZE_PCT = FIXED_POSITION_PCT;
export const MAX_RISK_PER_TRADE_HARD_CAP_PCT = 1;

export interface RiskPolicy {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
  maxOpenPositions: number;
  maxGrossExposurePct: number;
  maxConsecutiveLosses: number;
  maxCorrelation: number;
}

export const DEFAULT_RISK_POLICY: Readonly<RiskPolicy> = {
  maxRiskPerTradePct: 0.5,
  maxDailyLossPct: 2,
  maxTradesPerDay: 5,
  maxOpenPositions: 3,
  maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT,
  maxConsecutiveLosses: 3,
  maxCorrelation: 0.8,
};

export interface RiskState {
  equity: number;
  dailyLossPct: number;
  tradesToday: number;
  openPositions: number;
  grossExposurePct: number;
  consecutiveLosses: number;
  correlationToOpenPositions?: number;
  eventBlocked?: boolean;
}

export interface RiskV2Input {
  decision: DecisionResult;
  regime: RegimeSnapshot;
  state: RiskState;
  stopDistancePct: number;
  policy?: Partial<RiskPolicy>;
}

export type RiskBlockReason =
  | "wait_decision"
  | "high_volatility"
  | "invalid_risk_input"
  | "daily_loss_limit"
  | "trade_limit"
  | "position_limit"
  | "gross_exposure_limit"
  | "correlation_limit"
  | "consecutive_loss_limit"
  | "event_block"
  | "risk_ok";

export interface RiskAssessment {
  version: string;
  allowed: boolean;
  positionSizePct: number;
  maxGrossExposurePct: number;
  riskPerTradePct: number;
  riskAmount: number;
  stopDistancePct: number;
  reason: RiskBlockReason;
  regime: RegimeSnapshot;
}

function mergedPolicy(policy?: Partial<RiskPolicy>): RiskPolicy {
  const result = { ...DEFAULT_RISK_POLICY, ...policy };
  if (
    !Object.values(result).every((value) => Number.isFinite(value)) ||
    result.maxRiskPerTradePct <= 0 ||
    result.maxRiskPerTradePct > MAX_RISK_PER_TRADE_HARD_CAP_PCT ||
    result.maxDailyLossPct <= 0 ||
    result.maxTradesPerDay < 0 ||
    result.maxOpenPositions < 0 ||
    result.maxGrossExposurePct <= 0 ||
    result.maxGrossExposurePct > 100 ||
    result.maxConsecutiveLosses < 0 ||
    result.maxCorrelation < 0 ||
    result.maxCorrelation > 1
  ) {
    throw new Error("Invalid risk policy");
  }
  return result;
}

function blocked(
  reason: RiskBlockReason,
  regime: RegimeSnapshot,
  policy: RiskPolicy,
  riskPerTradePct = 0,
  riskAmount = 0,
  stopDistancePct = 0,
): RiskAssessment {
  return {
    version: RISK_ENGINE_VERSION,
    allowed: false,
    positionSizePct: 0,
    maxGrossExposurePct: policy.maxGrossExposurePct,
    riskPerTradePct,
    riskAmount,
    stopDistancePct,
    reason,
    regime,
  };
}

export function evaluateRiskV2(input: RiskV2Input): RiskAssessment {
  const policy = mergedPolicy(input.policy);
  const { decision, regime, state, stopDistancePct } = input;

  if (decision.recomendacao === "WAIT") return blocked("wait_decision", regime, policy);
  if (regime.volatility === "HIGH") return blocked("high_volatility", regime, policy);
  if (
    !Number.isFinite(state.equity) ||
    state.equity <= 0 ||
    !Number.isFinite(stopDistancePct) ||
    stopDistancePct <= 0 ||
    !Number.isFinite(state.dailyLossPct) ||
    !Number.isFinite(state.grossExposurePct) ||
    !Number.isFinite(state.tradesToday) ||
    !Number.isFinite(state.openPositions) ||
    !Number.isFinite(state.consecutiveLosses)
  ) {
    return blocked("invalid_risk_input", regime, policy);
  }

  const riskAmount = state.equity * (policy.maxRiskPerTradePct / 100);
  const riskPerTradePct = policy.maxRiskPerTradePct;
  const requestedNotionalPct = (riskPerTradePct / stopDistancePct) * 100;
  const remainingExposurePct = Math.max(0, policy.maxGrossExposurePct - state.grossExposurePct);
  const positionSizePct = Math.min(requestedNotionalPct, remainingExposurePct);

  if (state.dailyLossPct >= policy.maxDailyLossPct) {
    return blocked("daily_loss_limit", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }
  if (state.tradesToday >= policy.maxTradesPerDay) {
    return blocked("trade_limit", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }
  if (state.openPositions >= policy.maxOpenPositions) {
    return blocked("position_limit", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }
  if (state.grossExposurePct >= policy.maxGrossExposurePct || positionSizePct <= 0) {
    return blocked("gross_exposure_limit", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }
  if (
    state.correlationToOpenPositions !== undefined &&
    (!Number.isFinite(state.correlationToOpenPositions) ||
      state.correlationToOpenPositions > policy.maxCorrelation)
  ) {
    return blocked("correlation_limit", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }
  if (state.consecutiveLosses >= policy.maxConsecutiveLosses) {
    return blocked("consecutive_loss_limit", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }
  if (state.eventBlocked) {
    return blocked("event_block", regime, policy, riskPerTradePct, riskAmount, stopDistancePct);
  }

  return {
    version: RISK_ENGINE_VERSION,
    allowed: true,
    positionSizePct,
    maxGrossExposurePct: policy.maxGrossExposurePct,
    riskPerTradePct,
    riskAmount,
    stopDistancePct,
    reason: "risk_ok",
    regime,
  };
}

export function applyRiskToDecision(decision: DecisionResult, risk: RiskAssessment): DecisionResult {
  if (risk.allowed) {
    return {
      ...decision,
      tamanhoPosicaoPct: Math.min(
        decision.tamanhoPosicaoPct || risk.positionSizePct,
        risk.positionSizePct,
      ),
      observacao: [
        decision.observacao,
        `risk=${risk.reason} regime=${risk.regime.key} size=${risk.positionSizePct}`,
      ].filter(Boolean).join(" "),
    };
  }

  const originalRecommendation: Recomendacao = decision.recomendacao;
  return {
    ...decision,
    recomendacao: "WAIT",
    tamanhoPosicaoPct: 0,
    riscoElevado: originalRecommendation !== "WAIT" || Boolean(decision.riscoElevado),
    observacao: [
      decision.observacao,
      `risk=blocked reason=${risk.reason} regime=${risk.regime.key}`,
    ].filter(Boolean).join(" "),
  };
}
