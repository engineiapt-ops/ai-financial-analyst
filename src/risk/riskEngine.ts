import type { DecisionResult, Recomendacao } from "../types.js";
import type { RegimeSnapshot } from "./regime.js";

export const RISK_ENGINE_VERSION = "risk-engine-v1";
export const RISK_POSITION_SIZE_PCT = 2;
export const RISK_MAX_GROSS_EXPOSURE_PCT = 20;

export interface RiskAssessment {
  version: string;
  allowed: boolean;
  positionSizePct: number;
  maxGrossExposurePct: number;
  reason:
    | "wait_decision"
    | "high_volatility"
    | "risk_ok";
  regime: RegimeSnapshot;
}

export function evaluateRisk(
  decision: DecisionResult,
  regime: RegimeSnapshot,
): RiskAssessment {
  if (decision.recomendacao === "WAIT") {
    return {
      version: RISK_ENGINE_VERSION,
      allowed: false,
      positionSizePct: 0,
      maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT,
      reason: "wait_decision",
      regime,
    };
  }

  if (regime.volatility === "HIGH") {
    return {
      version: RISK_ENGINE_VERSION,
      allowed: false,
      positionSizePct: 0,
      maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT,
      reason: "high_volatility",
      regime,
    };
  }

  return {
    version: RISK_ENGINE_VERSION,
    allowed: true,
    positionSizePct: RISK_POSITION_SIZE_PCT,
    maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT,
    reason: "risk_ok",
    regime,
  };
}

export function applyRiskToDecision(
  decision: DecisionResult,
  risk: RiskAssessment,
): DecisionResult {
  if (risk.allowed) {
    return {
      ...decision,
      tamanhoPosicaoPct: Math.min(decision.tamanhoPosicaoPct, risk.positionSizePct),
      observacao: [decision.observacao, `risk=${risk.reason} regime=${risk.regime.key}`]
        .filter(Boolean)
        .join(" "),
    };
  }

  const originalRecommendation: Recomendacao = decision.recomendacao;
  return {
    ...decision,
    recomendacao: "WAIT",
    tamanhoPosicaoPct: 0,
    riscoElevado: originalRecommendation !== "WAIT" || decision.riscoElevado,
    observacao: [
      decision.observacao,
      `risk=blocked reason=${risk.reason} regime=${risk.regime.key}`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
