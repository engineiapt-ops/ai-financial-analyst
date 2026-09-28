import { FIXED_POSITION_PCT } from "../config/thresholds.js";
import type { DecisionResult, Recomendacao } from "../types.js";
import type { RegimeSnapshot } from "./regime.js";

export const RISK_ENGINE_VERSION = "risk-engine-v2";
export const RISK_MAX_GROSS_EXPOSURE_PCT = 15;
export const RISK_POSITION_SIZE_PCT = FIXED_POSITION_PCT;

export interface RiskAssessment {
  version: string;
  allowed: boolean;
  positionSizePct: number;
  maxGrossExposurePct: number;
  reason: "wait_decision" | "high_volatility" | "elevated_decision_risk" | "risk_ok";
  regime: RegimeSnapshot;
}

export function evaluateRisk(decision: DecisionResult, regime: RegimeSnapshot): RiskAssessment {
  if (decision.recomendacao === "WAIT") return {
    version: RISK_ENGINE_VERSION, allowed: false, positionSizePct: 0,
    maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT, reason: "wait_decision", regime,
  };
  if (regime.volatility === "HIGH") return {
    version: RISK_ENGINE_VERSION, allowed: false, positionSizePct: 0,
    maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT, reason: "high_volatility", regime,
  };

  const baseSize =
    Number.isFinite(decision.tamanhoPosicaoPct) && decision.tamanhoPosicaoPct > 0
      ? decision.tamanhoPosicaoPct
      : FIXED_POSITION_PCT;
  let positionSizePct = Math.min(baseSize, FIXED_POSITION_PCT);
  if (decision.riscoElevado) {
    positionSizePct = Math.round(positionSizePct * 0.5 * 100) / 100;
  }

  if (positionSizePct <= 0) return {
    version: RISK_ENGINE_VERSION, allowed: false, positionSizePct: 0,
    maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT,
    reason: "elevated_decision_risk", regime,
  };

  return {
    version: RISK_ENGINE_VERSION, allowed: true, positionSizePct,
    maxGrossExposurePct: RISK_MAX_GROSS_EXPOSURE_PCT, reason: "risk_ok", regime,
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
