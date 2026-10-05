export const BARRIER_OPTIONS_RISK_VERSION = "barrier-options-risk-v1";

export type BarrierDirection = "UP_AND_OUT" | "DOWN_AND_OUT";
export type BarrierOptionType = "CALL" | "PUT";

export interface DynamicKnockOutInput {
  spot: number;
  atr: number;
  direction: BarrierDirection;
  atrMultiple?: number;
}

export interface BarrierOptionContract {
  symbol: string;
  type: BarrierOptionType;
  direction: BarrierDirection;
  strike: number;
  expiry: Date;
  premium: number;
  contractMultiplier?: number;
  knockOutLevel?: number;
  atr?: number;
  knockoutAtrMultiple?: number;
}

export interface BarrierOptionRiskConfig {
  evaluationAt: Date;
  targetUnderlyingPrice: number;
  accountEquity: number;
  maxOneContractRiskPct?: number;
  minKnockOutDistanceAtr?: number;
  defaultKnockoutAtrMultiple?: number;
}

export interface BarrierOptionRiskResult {
  version: typeof BARRIER_OPTIONS_RISK_VERSION;
  contract: BarrierOptionContract;
  knockOutLevel: number | null;
  knockOutDistance: number | null;
  knockOutDistanceAtr: number | null;
  daysToExpiry: number;
  maxLossPerContract: number;
  maxLossPctOfEquity: number;
  conservativeRewardPerContract: number;
  riskReward: number;
  eligible: boolean;
  rejectionReasons: string[];
}

export interface BarrierMonitoringCandle {
  high: number;
  low: number;
}

/**
 * Derives a deterministic knock-out level from spot and ATR.
 *
 * UP_AND_OUT: barrier sits above spot.
 * DOWN_AND_OUT: barrier sits below spot.
 */
export function deriveDynamicKnockOutLevel(
  input: DynamicKnockOutInput,
): number {
  positive("spot", input.spot);
  positive("atr", input.atr);

  const atrMultiple = input.atrMultiple ?? 1.5;
  positive("atrMultiple", atrMultiple);

  const level =
    input.direction === "UP_AND_OUT"
      ? input.spot + input.atr * atrMultiple
      : input.spot - input.atr * atrMultiple;

  positive("derived knockOutLevel", level);
  return level;
}

/**
 * Returns true when a candle conservatively proves that the barrier was
 * touched/crossed. Using high/low is intentionally conservative for a
 * read-only monitor and does not assume intrabar path information.
 */
export function knockOutBreachedByCandle(
  direction: BarrierDirection,
  knockOutLevel: number,
  candle: BarrierMonitoringCandle,
): boolean {
  positive("knockOutLevel", knockOutLevel);
  nonNegative("candle.high", candle.high);
  nonNegative("candle.low", candle.low);

  if (candle.low > candle.high) {
    throw new Error("candle.low cannot exceed candle.high");
  }

  return direction === "UP_AND_OUT"
    ? candle.high >= knockOutLevel
    : candle.low <= knockOutLevel;
}

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function positive(name: string, value: number): void {
  finite(name, value);
  if (value <= 0) {
    throw new Error(`${name} must be greater than zero`);
  }
}

function nonNegative(name: string, value: number): void {
  finite(name, value);
  if (value < 0) {
    throw new Error(`${name} must be non-negative`);
  }
}

function multiplier(contract: BarrierOptionContract): number {
  const value = contract.contractMultiplier ?? 1;
  positive("contractMultiplier", value);
  return value;
}

function intrinsicAtTarget(
  type: BarrierOptionType,
  strike: number,
  target: number,
): number {
  return type === "CALL"
    ? Math.max(0, target - strike)
    : Math.max(0, strike - target);
}

function validateContract(contract: BarrierOptionContract): void {
  if (!contract.symbol.trim()) {
    throw new Error("option symbol is required");
  }

  if (contract.type !== "CALL" && contract.type !== "PUT") {
    throw new Error("option type must be CALL or PUT");
  }

  positive("strike", contract.strike);
  positive("premium", contract.premium);

  if (
    !(contract.expiry instanceof Date) ||
    Number.isNaN(contract.expiry.getTime())
  ) {
    throw new Error("expiry must be a valid Date");
  }

  if (contract.knockOutLevel !== undefined) {
    positive("knockOutLevel", contract.knockOutLevel);
  }

  if (contract.atr !== undefined) {
    positive("atr", contract.atr);
  }

  if (contract.knockoutAtrMultiple !== undefined) {
    positive("knockoutAtrMultiple", contract.knockoutAtrMultiple);
  }

  multiplier(contract);
}

function normalizedRiskLimit(value: number | undefined): number {
  const limit = value ?? 1;
  finite("maxOneContractRiskPct", limit);

  if (limit <= 0 || limit > 1) {
    throw new Error("maxOneContractRiskPct must be in (0, 1]");
  }

  return limit;
}

function normalizedMinBarrierDistanceAtr(value: number | undefined): number {
  const minDistance = value ?? 1;
  positive("minKnockOutDistanceAtr", minDistance);
  return minDistance;
}

function normalizedDefaultKnockoutMultiple(value: number | undefined): number {
  const multiple = value ?? 1.5;
  positive("defaultKnockoutAtrMultiple", multiple);
  return multiple;
}

function resolvesKnockOutLevel(
  spot: number,
  contract: BarrierOptionContract,
  config: BarrierOptionRiskConfig,
): number {
  if (contract.knockOutLevel !== undefined) {
    return contract.knockOutLevel;
  }

  if (contract.atr !== undefined) {
    return deriveDynamicKnockOutLevel({
      spot,
      atr: contract.atr,
      direction: contract.direction,
      atrMultiple:
        contract.knockoutAtrMultiple ??
        config.defaultKnockoutAtrMultiple,
    });
  }

  throw new Error(
    "knockOutLevel or atr is required to resolve the knock-out barrier",
  );
}

/**
 * Evaluates a long barrier-option candidate without sending orders.
 *
 * Hard gates:
 * - maximum one-contract loss <= configured percentage of account equity
 *   (default 1%);
 * - conservative risk/reward >= 2.0;
 * - target must remain reachable without crossing the knock-out barrier;
 * - when ATR is available, the barrier must be at least the configured
 *   minimum ATR distance from spot (default 1 ATR).
 *
 * The function deliberately does not model a live execution path or broker
 * settlement. It is a risk/eligibility layer only.
 */
export function evaluateBarrierOptionRisk(
  spot: number,
  contract: BarrierOptionContract,
  config: BarrierOptionRiskConfig,
): BarrierOptionRiskResult {
  positive("spot", spot);
  if (
    !(config.evaluationAt instanceof Date) ||
    Number.isNaN(config.evaluationAt.getTime())
  ) {
    throw new Error("evaluationAt must be a valid Date");
  }
  positive("targetUnderlyingPrice", config.targetUnderlyingPrice);
  positive("accountEquity", config.accountEquity);

  const riskLimit = normalizedRiskLimit(config.maxOneContractRiskPct);
  const minBarrierDistanceAtr = normalizedMinBarrierDistanceAtr(
    config.minKnockOutDistanceAtr,
  );
  const defaultKnockoutMultiple = normalizedDefaultKnockoutMultiple(
    config.defaultKnockoutAtrMultiple,
  );

  validateContract(contract);

  const multiplierValue = multiplier(contract);
  const daysToExpiry =
    (contract.expiry.getTime() - config.evaluationAt.getTime()) /
    86_400_000;
  const rejectionReasons: string[] = [];

  if (daysToExpiry <= 0) {
    rejectionReasons.push("expired");
  }

  if (contract.direction !== "UP_AND_OUT" && contract.direction !== "DOWN_AND_OUT") {
    throw new Error(
      "barrier direction must be UP_AND_OUT or DOWN_AND_OUT",
    );
  }

  const knockOutLevel = resolvesKnockOutLevel(
    spot,
    candidateWithDirection,
    {
      ...config,
      defaultKnockoutAtrMultiple: defaultKnockoutMultiple,
    },
  );

  if (
    contract.direction === "UP_AND_OUT" &&
    knockOutLevel <= spot
  ) {
    rejectionReasons.push("knockout_not_above_spot");
  }

  if (
    contract.direction === "DOWN_AND_OUT" &&
    knockOutLevel >= spot
  ) {
    rejectionReasons.push("knockout_not_below_spot");
  }

  const knockOutDistance = Math.abs(spot - knockOutLevel);
  const knockOutDistanceAtr =
    contract.atr !== undefined && contract.atr > 0
      ? knockOutDistance / contract.atr
      : null;

  if (
    knockOutDistanceAtr !== null &&
    knockOutDistanceAtr < minBarrierDistanceAtr
  ) {
    rejectionReasons.push("knockout_too_close_in_atr");
  }

  if (
    (contract.direction === "UP_AND_OUT" &&
      config.targetUnderlyingPrice >= knockOutLevel) ||
    (contract.direction === "DOWN_AND_OUT" &&
      config.targetUnderlyingPrice <= knockOutLevel)
  ) {
    rejectionReasons.push("target_breaches_knockout");
  }

  const maxLossPerContract = contract.premium * multiplierValue;
  const maxLossPctOfEquity =
    (maxLossPerContract / config.accountEquity) * 100;

  if (maxLossPctOfEquity > riskLimit) {
    rejectionReasons.push("one_contract_risk_limit");
  }

  const conservativeRewardPerContract =
    Math.max(
      0,
      intrinsicAtTarget(
        contract.type,
        contract.strike,
        config.targetUnderlyingPrice,
      ) - contract.premium,
    ) * multiplierValue;

  const riskReward =
    maxLossPerContract > 0
      ? conservativeRewardPerContract / maxLossPerContract
      : 0;

  if (riskReward < 2) {
    rejectionReasons.push("risk_reward_below_2");
  }

  return {
    version: BARRIER_OPTIONS_RISK_VERSION,
    contract,
    knockOutLevel,
    knockOutDistance,
    knockOutDistanceAtr,
    daysToExpiry: Math.max(0, daysToExpiry),
    maxLossPerContract,
    maxLossPctOfEquity,
    conservativeRewardPerContract,
    riskReward,
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
  };
}
