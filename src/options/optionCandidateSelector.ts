import {
  impliedVolatility,
  valueVanillaOption,
  type VanillaOptionType,
} from "./optionPricing.js";

export const VANILLA_OPTION_SELECTOR_VERSION = "vanilla-option-selector-v1";

export interface VanillaOptionQuote {
  symbol: string;
  type: VanillaOptionType;
  strike: number;
  expiry: Date;
  bid: number;
  ask: number;
  volume?: number;
  openInterest?: number;
  contractMultiplier?: number;
}

export interface VanillaOptionSelectorConfig {
  evaluationAt: Date;
  targetUnderlyingPrice: number;
  accountEquity: number;
  referenceVolatility: number;
  maxSpreadPct?: number;
  minDaysToExpiry?: number;
  maxDaysToExpiry?: number;
  targetDelta?: number;
  maxOneContractRiskPct?: number;
  maxCandidates?: number;
}

export interface VanillaOptionCandidate {
  quote: VanillaOptionQuote;
  mid: number;
  spreadPct: number;
  daysToExpiry: number;
  timeToExpiryYears: number;
  impliedVolatility: number;
  theoreticalPrice: number;
  theoreticalEdgePct: number;
  delta: number;
  gamma: number;
  vegaPerOnePctVol: number;
  thetaPerDay: number;
  rhoPerOneBp: number;
  breakEvenPrice: number;
  maxLossPerContract: number;
  maxLossPctOfEquity: number;
  conservativeRewardPerContract: number;
  riskReward: number;
  score: number;
  eligible: boolean;
  rejectionReasons: string[];
}

export interface VanillaOptionSelectionResult {
  version: typeof VANILLA_OPTION_SELECTOR_VERSION;
  status: "selected" | "no_eligible_candidates";
  selected: VanillaOptionCandidate | null;
  candidates: VanillaOptionCandidate[];
}

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365;
const DEFAULT_MAX_SPREAD_PCT = 10;
const DEFAULT_MIN_DTE = 7;
const DEFAULT_MAX_DTE = 365;
const DEFAULT_TARGET_DELTA = 0.5;
const DEFAULT_MAX_ONE_CONTRACT_RISK_PCT = 1;
const DEFAULT_MAX_CANDIDATES = 10;

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function positive(name: string, value: number): void {
  finite(name, value);
  if (value <= 0) throw new Error(`${name} must be greater than zero`);
}

function nonNegative(name: string, value: number): void {
  finite(name, value);
  if (value < 0) throw new Error(`${name} must be non-negative`);
}

function validateConfig(config: VanillaOptionSelectorConfig): Required<VanillaOptionSelectorConfig> {
  const normalized = {
    evaluationAt: config.evaluationAt,
    targetUnderlyingPrice: config.targetUnderlyingPrice,
    accountEquity: config.accountEquity,
    referenceVolatility: config.referenceVolatility,
    maxSpreadPct: config.maxSpreadPct ?? DEFAULT_MAX_SPREAD_PCT,
    minDaysToExpiry: config.minDaysToExpiry ?? DEFAULT_MIN_DTE,
    maxDaysToExpiry: config.maxDaysToExpiry ?? DEFAULT_MAX_DTE,
    targetDelta: config.targetDelta ?? DEFAULT_TARGET_DELTA,
    maxOneContractRiskPct:
      config.maxOneContractRiskPct ?? DEFAULT_MAX_ONE_CONTRACT_RISK_PCT,
    maxCandidates: config.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
  };

  if (!(normalized.evaluationAt instanceof Date) || Number.isNaN(normalized.evaluationAt.getTime())) {
    throw new Error("evaluationAt must be a valid Date");
  }
  positive("targetUnderlyingPrice", normalized.targetUnderlyingPrice);
  positive("accountEquity", normalized.accountEquity);
  positive("referenceVolatility", normalized.referenceVolatility);
  nonNegative("maxSpreadPct", normalized.maxSpreadPct);
  if (!Number.isInteger(normalized.minDaysToExpiry) || normalized.minDaysToExpiry < 0) {
    throw new Error("minDaysToExpiry must be an integer >= 0");
  }
  if (!Number.isInteger(normalized.maxDaysToExpiry) || normalized.maxDaysToExpiry < normalized.minDaysToExpiry) {
    throw new Error("maxDaysToExpiry must be an integer >= minDaysToExpiry");
  }
  if (
    !Number.isFinite(normalized.targetDelta) ||
    normalized.targetDelta <= 0 ||
    normalized.targetDelta >= 1
  ) {
    throw new Error("targetDelta must be between 0 and 1");
  }
  if (
    !Number.isFinite(normalized.maxOneContractRiskPct) ||
    normalized.maxOneContractRiskPct <= 0 ||
    normalized.maxOneContractRiskPct > 1
  ) {
    throw new Error("maxOneContractRiskPct must be in (0, 1]");
  }
  if (!Number.isInteger(normalized.maxCandidates) || normalized.maxCandidates < 1 || normalized.maxCandidates > 100) {
    throw new Error("maxCandidates must be an integer between 1 and 100");
  }

  return normalized;
}

function normalizedMultiplier(quote: VanillaOptionQuote): number {
  const multiplier = quote.contractMultiplier ?? 1;
  positive("contractMultiplier", multiplier);
  return multiplier;
}

function validateQuote(quote: VanillaOptionQuote): void {
  if (!quote.symbol.trim()) throw new Error("option symbol is required");
  positive("strike", quote.strike);

  if (!(quote.expiry instanceof Date) || Number.isNaN(quote.expiry.getTime())) {
    throw new Error(`Invalid expiry for ${quote.symbol}`);
  }

  nonNegative("bid", quote.bid);
  positive("ask", quote.ask);
  if (quote.bid > quote.ask) {
    throw new Error(`Bid cannot exceed ask for ${quote.symbol}`);
  }

  nonNegative("volume", quote.volume ?? 0);
  nonNegative("openInterest", quote.openInterest ?? 0);
  normalizedMultiplier(quote);
}

function intrinsicAtTarget(type: VanillaOptionType, strike: number, target: number): number {
  return type === "CALL"
    ? Math.max(0, target - strike)
    : Math.max(0, strike - target);
}

function breakEven(type: VanillaOptionType, strike: number, premium: number): number {
  return type === "CALL" ? strike + premium : strike - premium;
}

function candidateScore(input: {
  theoreticalEdgePct: number;
  spreadPct: number;
  delta: number;
  targetDelta: number;
  daysToExpiry: number;
  minDaysToExpiry: number;
  maxDaysToExpiry: number;
  liquidity: number;
}): number {
  const edge = Math.max(-1, Math.min(5, input.theoreticalEdgePct));
  const spreadPenalty = Math.min(1, input.spreadPct / 10);
  const deltaPenalty = Math.abs(Math.abs(input.delta) - input.targetDelta);
  const span = Math.max(1, input.maxDaysToExpiry - input.minDaysToExpiry);
  const center = (input.minDaysToExpiry + input.maxDaysToExpiry) / 2;
  const tenorPenalty = Math.min(1, Math.abs(input.daysToExpiry - center) / span);
  const liquidityBonus = Math.min(1, Math.log10(1 + Math.max(0, input.liquidity)) / 6);

  return edge * 2
    - spreadPenalty
    - deltaPenalty
    - tenorPenalty * 0.5
    + liquidityBonus * 0.5;
}

/**
 * Selects long vanilla-option candidates using conservative intrinsic-only
 * reward at the supplied underlying target. The selector never sends orders.
 *
 * Hard gate:
 * risk/reward must be >= 2.0 and one-contract maximum loss must not exceed
 * maxOneContractRiskPct of account equity (default 1%).
 */
export function rankVanillaOptionCandidates(
  spot: number,
  quotes: readonly VanillaOptionQuote[],
  config: VanillaOptionSelectorConfig,
  riskFreeRate = 0,
  dividendYield = 0,
): VanillaOptionSelectionResult {
  positive("spot", spot);
  finite("riskFreeRate", riskFreeRate);
  finite("dividendYield", dividendYield);

  const normalized = validateConfig(config);

  if (!quotes.length) {
    return {
      version: VANILLA_OPTION_SELECTOR_VERSION,
      status: "no_eligible_candidates",
      selected: null,
      candidates: [],
    };
  }

  const candidates: VanillaOptionCandidate[] = [];

  for (const quote of quotes) {
    try {
      validateQuote(quote);

      const daysToExpiry = (quote.expiry.getTime() - normalized.evaluationAt.getTime()) / DAY_MS;
      const rejectionReasons: string[] = [];

      if (daysToExpiry <= 0) {
        rejectionReasons.push("expired");
      }

      const roundedDays = Math.max(0, daysToExpiry);
      if (roundedDays < normalized.minDaysToExpiry) {
        rejectionReasons.push("dte_below_minimum");
      }
      if (roundedDays > normalized.maxDaysToExpiry) {
        rejectionReasons.push("dte_above_maximum");
      }

      const mid = (quote.bid + quote.ask) / 2;
      positive("mid", mid);
      const spreadPct = ((quote.ask - quote.bid) / mid) * 100;
      if (spreadPct > normalized.maxSpreadPct) {
        rejectionReasons.push("spread_too_wide");
      }

      const timeToExpiryYears = daysToExpiry / YEAR_DAYS;
      positive("timeToExpiryYears", timeToExpiryYears);

      if (rejectionReasons.includes("expired")) {
        candidates.push({
          quote,
          mid,
          spreadPct,
          daysToExpiry: roundedDays,
          timeToExpiryYears: 0,
          impliedVolatility: 0,
          theoreticalPrice: 0,
          theoreticalEdgePct: 0,
          delta: 0,
          gamma: 0,
          vegaPerOnePctVol: 0,
          thetaPerDay: 0,
          rhoPerOneBp: 0,
          breakEvenPrice: breakEven(quote.type, quote.strike, quote.ask),
          maxLossPerContract: quote.ask * normalizedMultiplier(quote),
          maxLossPctOfEquity:
            (quote.ask * normalizedMultiplier(quote) / normalized.accountEquity) * 100,
          conservativeRewardPerContract: 0,
          riskReward: 0,
          score: Number.NEGATIVE_INFINITY,
          eligible: false,
          rejectionReasons,
        });
        continue;
      }

      const iv = impliedVolatility(quote.type, {
        spot,
        strike: quote.strike,
        timeToExpiryYears,
        riskFreeRate,
        dividendYield,
        marketPrice: mid,
      });

      const valuation = valueVanillaOption(quote.type, {
        spot,
        strike: quote.strike,
        timeToExpiryYears,
        riskFreeRate,
        volatility: normalized.referenceVolatility,
        dividendYield,
      });

      const theoreticalEdgePct = ((valuation.price - quote.ask) / quote.ask) * 100;
      if (theoreticalEdgePct <= 0) {
        rejectionReasons.push("no_positive_theoretical_edge");
      }

      const multiplier = normalizedMultiplier(quote);
      const maxLossPerContract = quote.ask * multiplier;
      const maxLossPctOfEquity = (maxLossPerContract / normalized.accountEquity) * 100;
      if (maxLossPctOfEquity > normalized.maxOneContractRiskPct) {
        rejectionReasons.push("one_contract_risk_limit");
      }

      const conservativeRewardPerContract =
        Math.max(
          0,
          intrinsicAtTarget(quote.type, quote.strike, normalized.targetUnderlyingPrice) - quote.ask,
        ) * multiplier;

      const riskPerContract = maxLossPerContract;
      const riskReward =
        riskPerContract > 0
          ? conservativeRewardPerContract / riskPerContract
          : 0;

      if (riskReward < 2) {
        rejectionReasons.push("risk_reward_below_2");
      }

      const delta = valuation.greeks.delta;
      const liquidity = (quote.volume ?? 0) + (quote.openInterest ?? 0);
      const score = candidateScore({
        theoreticalEdgePct,
        spreadPct,
        delta,
        targetDelta: normalized.targetDelta,
        daysToExpiry: roundedDays,
        minDaysToExpiry: normalized.minDaysToExpiry,
        maxDaysToExpiry: normalized.maxDaysToExpiry,
        liquidity,
      });

      candidates.push({
        quote,
        mid,
        spreadPct,
        daysToExpiry: roundedDays,
        timeToExpiryYears,
        impliedVolatility: iv,
        theoreticalPrice: valuation.price,
        theoreticalEdgePct,
        delta,
        gamma: valuation.greeks.gamma,
        vegaPerOnePctVol: valuation.greeks.vegaPerOnePctVol,
        thetaPerDay: valuation.greeks.thetaPerDay,
        rhoPerOneBp: valuation.greeks.rhoPerOneBp,
        breakEvenPrice: breakEven(quote.type, quote.strike, quote.ask),
        maxLossPerContract,
        maxLossPctOfEquity,
        conservativeRewardPerContract,
        riskReward,
        score,
        eligible: rejectionReasons.length === 0,
        rejectionReasons,
      });
    } catch (error) {
      // A malformed quote is rejected individually; one bad contract must not
      // invalidate the entire candidate universe.
      candidates.push({
        quote,
        mid: 0,
        spreadPct: Infinity,
        daysToExpiry: 0,
        timeToExpiryYears: 0,
        impliedVolatility: 0,
        theoreticalPrice: 0,
        theoreticalEdgePct: 0,
        delta: 0,
        gamma: 0,
        vegaPerOnePctVol: 0,
        thetaPerDay: 0,
        rhoPerOneBp: 0,
        breakEvenPrice: 0,
        maxLossPerContract: 0,
        maxLossPctOfEquity: 0,
        conservativeRewardPerContract: 0,
        riskReward: 0,
        score: Number.NEGATIVE_INFINITY,
        eligible: false,
        rejectionReasons: [
          error instanceof Error ? error.message : "invalid_quote",
        ],
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const limited = candidates.slice(0, normalized.maxCandidates);
  const selected = limited.find((candidate) => candidate.eligible) ?? null;

  return {
    version: VANILLA_OPTION_SELECTOR_VERSION,
    status: selected ? "selected" : "no_eligible_candidates",
    selected,
    candidates: limited,
  };
}
