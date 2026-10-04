export const MAX_RISK_PER_TRADE_PCT = 1;

export interface PositionSizingResult {
  allowed: boolean;
  riskPerTradePct: number;
  riskAmount: number;
  stopDistancePct: number;
  notionalPct: number;
}

export function calculatePositionSize(input: {
  equity: number;
  stopDistancePct: number;
  requestedRiskPct?: number;
}): PositionSizingResult {
  const requestedRiskPct = input.requestedRiskPct ?? MAX_RISK_PER_TRADE_PCT;
  if (!Number.isFinite(input.equity) || input.equity <= 0) throw new Error("equity must be > 0");
  if (!Number.isFinite(input.stopDistancePct) || input.stopDistancePct <= 0) {
    throw new Error("stopDistancePct must be > 0");
  }
  if (!Number.isFinite(requestedRiskPct) || requestedRiskPct <= 0) {
    throw new Error("requestedRiskPct must be > 0");
  }

  const riskPerTradePct = Math.min(requestedRiskPct, MAX_RISK_PER_TRADE_PCT);
  const riskAmount = input.equity * riskPerTradePct / 100;
  const notionalPct = riskPerTradePct / input.stopDistancePct * 100;

  return {
    allowed: true,
    riskPerTradePct,
    riskAmount,
    stopDistancePct: input.stopDistancePct,
    notionalPct,
  };
}
