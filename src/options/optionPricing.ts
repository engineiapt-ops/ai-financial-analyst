export const VANILLA_OPTIONS_MODEL_VERSION = "vanilla-options-bs-v1";

export type VanillaOptionType = "CALL" | "PUT";

export interface BlackScholesInput {
  spot: number;
  strike: number;
  timeToExpiryYears: number;
  riskFreeRate: number;
  volatility: number;
  dividendYield?: number;
}

export interface VanillaOptionGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  vegaPerOnePctVol: number;
  thetaPerDay: number;
  rhoPerOneBp: number;
}

export interface VanillaOptionValuation {
  version: typeof VANILLA_OPTIONS_MODEL_VERSION;
  type: VanillaOptionType;
  price: number;
  d1: number;
  d2: number;
  greeks: VanillaOptionGreeks;
}

export const DEFAULT_IV_LOWER_BOUND = 1e-6;
export const DEFAULT_IV_UPPER_BOUND = 10;
export const DEFAULT_IV_TOLERANCE = 1e-8;
export const DEFAULT_IV_MAX_ITERATIONS = 150;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function assertPositive(name: string, value: number): void {
  assertFinite(name, value);
  if (value <= 0) {
    throw new Error(`${name} must be greater than zero`);
  }
}

function validateInput(input: BlackScholesInput): Required<BlackScholesInput> {
  assertPositive("spot", input.spot);
  assertPositive("strike", input.strike);
  assertPositive("timeToExpiryYears", input.timeToExpiryYears);
  assertFinite("riskFreeRate", input.riskFreeRate);
  assertPositive("volatility", input.volatility);

  const dividendYield = input.dividendYield ?? 0;
  assertFinite("dividendYield", dividendYield);

  return {
    spot: input.spot,
    strike: input.strike,
    timeToExpiryYears: input.timeToExpiryYears,
    riskFreeRate: input.riskFreeRate,
    volatility: input.volatility,
    dividendYield,
  };
}

/**
 * Standard normal probability density.
 */
export function standardNormalPdf(x: number): number {
  assertFinite("x", x);
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Abramowitz-Stegun style approximation of the standard normal CDF.
 * Maximum error is small enough for pricing/risk analytics at this layer.
 */
export function standardNormalCdf(x: number): number {
  assertFinite("x", x);

  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * z);
  const polynomial =
    (((((1.330274429 * t - 1.821255978) * t) + 1.781477937) * t
      - 0.356563782) * t + 0.319381530) * t;
  const approximation =
    1 - standardNormalPdf(z) * polynomial;

  return sign === 1 ? approximation : 1 - approximation;
}

function d1D2(input: BlackScholesInput): { input: Required<BlackScholesInput>; d1: number; d2: number } {
  const normalized = validateInput(input);
  const {
    spot,
    strike,
    timeToExpiryYears: timeToExpiry,
    riskFreeRate,
    volatility,
    dividendYield,
  } = normalized;

  const sqrtT = Math.sqrt(timeToExpiry);
  const denominator = volatility * sqrtT;
  const numerator =
    Math.log(spot / strike) +
    (riskFreeRate - dividendYield + 0.5 * volatility * volatility) *
      timeToExpiry;

  const d1 = numerator / denominator;
  const d2 = d1 - denominator;

  return { input: normalized, d1, d2 };
}

export function blackScholesPrice(
  optionType: VanillaOptionType,
  input: BlackScholesInput,
): number {
  const { input: normalized, d1, d2 } = d1D2(input);
  const {
    spot,
    strike,
    timeToExpiryYears: timeToExpiry,
    riskFreeRate,
    dividendYield,
  } = normalized;

  const discountedSpot = spot * Math.exp(-dividendYield * timeToExpiry);
  const discountedStrike = strike * Math.exp(-riskFreeRate * timeToExpiry);

  if (optionType === "CALL") {
    return discountedSpot * standardNormalCdf(d1)
      - discountedStrike * standardNormalCdf(d2);
  }

  return discountedStrike * standardNormalCdf(-d2)
    - discountedSpot * standardNormalCdf(-d1);
}

export function blackScholesGreeks(
  optionType: VanillaOptionType,
  input: BlackScholesInput,
): VanillaOptionGreeks {
  const { input: normalized, d1, d2 } = d1D2(input);
  const {
    spot,
    strike,
    timeToExpiryYears: timeToExpiry,
    riskFreeRate,
    volatility,
    dividendYield,
  } = normalized;

  const sqrtT = Math.sqrt(timeToExpiry);
  const discountedSpot = spot * Math.exp(-dividendYield * timeToExpiry);
  const discountedStrike = strike * Math.exp(-riskFreeRate * timeToExpiry);
  const pdf = standardNormalPdf(d1);

  const delta = optionType === "CALL"
    ? Math.exp(-dividendYield * timeToExpiry) * standardNormalCdf(d1)
    : Math.exp(-dividendYield * timeToExpiry) * (standardNormalCdf(d1) - 1);

  const gamma = (Math.exp(-dividendYield * timeToExpiry) * pdf)
    / (spot * volatility * sqrtT);

  // Vega is sensitivity to a +1.00 absolute volatility move (+100 vol points).
  const vega = discountedSpot * pdf * sqrtT;

  const commonTheta =
    -(discountedSpot * pdf * volatility) / (2 * sqrtT);

  const theta = optionType === "CALL"
    ? commonTheta
      - riskFreeRate * discountedStrike * standardNormalCdf(d2)
      + dividendYield * discountedSpot * standardNormalCdf(d1)
    : commonTheta
      + riskFreeRate * discountedStrike * standardNormalCdf(-d2)
      - dividendYield * discountedSpot * standardNormalCdf(-d1);

  const rho = optionType === "CALL"
    ? timeToExpiry * discountedStrike * standardNormalCdf(d2)
    : -timeToExpiry * discountedStrike * standardNormalCdf(-d2);

  return {
    delta,
    gamma,
    vega,
    theta,
    rho,
    vegaPerOnePctVol: vega * 0.01,
    thetaPerDay: theta / 365,
    rhoPerOneBp: rho * 0.0001,
  };
}

export function valueVanillaOption(
  optionType: VanillaOptionType,
  input: BlackScholesInput,
): VanillaOptionValuation {
  const { d1, d2 } = d1D2(input);
  const price = blackScholesPrice(optionType, input);
  const greeks = blackScholesGreeks(optionType, input);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Black-Scholes returned an invalid option price");
  }

  return {
    version: VANILLA_OPTIONS_MODEL_VERSION,
    type: optionType,
    price,
    d1,
    d2,
    greeks,
  };
}

function noArbitrageBounds(
  optionType: VanillaOptionType,
  input: Omit<BlackScholesInput, "volatility">,
): { lower: number; upper: number } {
  const normalized: Required<Omit<BlackScholesInput, "volatility">> = {
    ...input,
    dividendYield: input.dividendYield ?? 0,
  };

  assertPositive("spot", normalized.spot);
  assertPositive("strike", normalized.strike);
  assertPositive("timeToExpiryYears", normalized.timeToExpiryYears);
  assertFinite("riskFreeRate", normalized.riskFreeRate);
  assertFinite("dividendYield", normalized.dividendYield);

  const discountedSpot =
    normalized.spot * Math.exp(-normalized.dividendYield * normalized.timeToExpiryYears);
  const discountedStrike =
    normalized.strike * Math.exp(-normalized.riskFreeRate * normalized.timeToExpiryYears);

  if (optionType === "CALL") {
    return {
      lower: Math.max(0, discountedSpot - discountedStrike),
      upper: discountedSpot,
    };
  }

  return {
    lower: Math.max(0, discountedStrike - discountedSpot),
    upper: discountedStrike,
  };
}

/**
 * Implied volatility is solved with bisection.
 *
 * Bisection is deliberately slower than Newton-Raphson but is safer here:
 * the price->volatility function is monotonic for standard Black-Scholes
 * European options and the solver cannot diverge from a valid bracket.
 */
export function impliedVolatility(
  optionType: VanillaOptionType,
  input: Omit<BlackScholesInput, "volatility"> & { marketPrice: number },
  options: {
    lowerBound?: number;
    upperBound?: number;
    tolerance?: number;
    maxIterations?: number;
  } = {},
): number {
  const marketPrice = input.marketPrice;
  assertFinite("marketPrice", marketPrice);
  if (marketPrice < 0) {
    throw new Error("marketPrice must be non-negative");
  }

  const lowerBound = options.lowerBound ?? DEFAULT_IV_LOWER_BOUND;
  const upperBound = options.upperBound ?? DEFAULT_IV_UPPER_BOUND;
  const tolerance = options.tolerance ?? DEFAULT_IV_TOLERANCE;
  const maxIterations = options.maxIterations ?? DEFAULT_IV_MAX_ITERATIONS;

  assertPositive("lowerBound", lowerBound);
  assertPositive("upperBound", upperBound);
  if (upperBound <= lowerBound) {
    throw new Error("upperBound must be greater than lowerBound");
  }
  assertPositive("tolerance", tolerance);
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error("maxIterations must be an integer >= 1");
  }

  const bounds = noArbitrageBounds(optionType, input);
  const priceTolerance = Math.max(tolerance, 1e-10);

  if (
    marketPrice < bounds.lower - priceTolerance ||
    marketPrice > bounds.upper + priceTolerance
  ) {
    throw new Error(
      `OPTION_IV_OUT_OF_BOUNDS: marketPrice=${marketPrice} bounds=[${bounds.lower},${bounds.upper}]`,
    );
  }

  // At exact intrinsic/boundary prices the finite-IV solution is not unique.
  // Return the configured minimum rather than manufacturing a divergent value.
  if (Math.abs(marketPrice - bounds.lower) <= priceTolerance) {
    return lowerBound;
  }

  let low = lowerBound;
  let high = upperBound;
  let lowPrice = blackScholesPrice(optionType, { ...input, volatility: low });
  let highPrice = blackScholesPrice(optionType, { ...input, volatility: high });

  if (marketPrice < lowPrice - priceTolerance || marketPrice > highPrice + priceTolerance) {
    throw new Error(
      `OPTION_IV_NOT_BRACKETED: volatility bounds [${low},${high}] do not bracket market price`,
    );
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    const midPrice = blackScholesPrice(optionType, { ...input, volatility: mid });
    const error = midPrice - marketPrice;

    if (Math.abs(error) <= tolerance) {
      return mid;
    }

    if (midPrice < marketPrice) {
      low = mid;
      lowPrice = midPrice;
    } else {
      high = mid;
      highPrice = midPrice;
    }

    if (Math.abs(high - low) <= tolerance) {
      return (low + high) / 2;
    }
  }

  throw new Error(
    `OPTION_IV_NO_CONVERGENCE: iterations=${maxIterations} bracket=[${low},${high}] price=[${lowPrice},${highPrice}]`,
  );
}
