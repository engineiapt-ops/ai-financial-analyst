export const MIN_RISK_REWARD = 2;

export interface RiskRewardAssessment {
  rewardPct: number;
  riskPct: number;
  ratio: number;
  passed: boolean;
}

export function assessRiskReward(
  targetPct: number,
  stopPct: number,
  minimumRatio = MIN_RISK_REWARD,
): RiskRewardAssessment {
  if (!Number.isFinite(targetPct) || targetPct <= 0) throw new Error("targetPct must be > 0");
  if (!Number.isFinite(stopPct) || stopPct <= 0) throw new Error("stopPct must be > 0");
  if (!Number.isFinite(minimumRatio) || minimumRatio <= 0) throw new Error("minimumRatio must be > 0");

  const ratio = targetPct / stopPct;
  return {
    rewardPct: targetPct,
    riskPct: stopPct,
    ratio,
    passed: ratio >= minimumRatio,
  };
}

export function assertMinimumRiskReward(
  targetPct: number,
  stopPct: number,
  minimumRatio = MIN_RISK_REWARD,
): RiskRewardAssessment {
  const assessment = assessRiskReward(targetPct, stopPct, minimumRatio);
  if (!assessment.passed) {
    throw new Error(
      `Risk/reward rejected: ${assessment.ratio.toFixed(4)} < ${minimumRatio.toFixed(4)}`,
    );
  }
  return assessment;
}
