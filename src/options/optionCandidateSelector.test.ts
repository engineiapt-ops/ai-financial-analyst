import { strict as assert } from "node:assert";
import {
  blackScholesPrice,
  impliedVolatility,
} from "./optionPricing.js";
import {
  rankVanillaOptionCandidates,
  VANILLA_OPTION_SELECTOR_VERSION,
  type VanillaOptionQuote,
} from "./optionCandidateSelector.js";

const evaluationAt = new Date("2026-10-05T00:00:00.000Z");
const expiry = new Date("2026-12-04T00:00:00.000Z");

const marketMid = blackScholesPrice("CALL", {
  spot: 100,
  strike: 90,
  timeToExpiryYears: 60 / 365,
  riskFreeRate: 0.02,
  volatility: 0.2,
  dividendYield: 0,
});

const quotes: VanillaOptionQuote[] = [
  {
    symbol: "TEST-C90",
    type: "CALL",
    strike: 90,
    expiry,
    bid: marketMid * 0.97,
    ask: marketMid * 1.03,
    volume: 1000,
    openInterest: 5000,
    contractMultiplier: 1,
  },
  {
    symbol: "TEST-C130",
    type: "CALL",
    strike: 130,
    expiry,
    bid: 0.1,
    ask: 0.2,
    volume: 10,
    openInterest: 20,
    contractMultiplier: 1,
  },
  {
    symbol: "TEST-BAD-SPREAD",
    type: "CALL",
    strike: 95,
    expiry,
    bid: 1,
    ask: 20,
    volume: 1,
    openInterest: 1,
    contractMultiplier: 1,
  },
  {
    symbol: "TEST-EXPIRED",
    type: "CALL",
    strike: 90,
    expiry: new Date("2026-10-04T00:00:00.000Z"),
    bid: 1,
    ask: 2,
  },
];

const result = rankVanillaOptionCandidates(
  100,
  quotes,
  {
    evaluationAt,
    targetUnderlyingPrice: 130,
    accountEquity: 10_000,
    referenceVolatility: 0.25,
    maxSpreadPct: 10,
    minDaysToExpiry: 7,
    maxDaysToExpiry: 180,
    maxOneContractRiskPct: 1,
    maxCandidates: 10,
  },
  0.02,
  0,
);

assert.equal(result.version, VANILLA_OPTION_SELECTOR_VERSION);
assert.equal(result.status, "selected");
assert.equal(result.selected?.quote.symbol, "TEST-C90");
assert.equal(result.selected?.eligible, true);
assert.ok((result.selected?.riskReward ?? 0) >= 2);
assert.ok((result.selected?.theoreticalEdgePct ?? 0) > 0);
assert.ok((result.selected?.spreadPct ?? 999) < 10);
assert.ok((result.selected?.delta ?? 0) > 0);

const badSpread = result.candidates.find(
  (candidate) => candidate.quote.symbol === "TEST-BAD-SPREAD",
);
assert.equal(badSpread?.eligible, false);
assert.ok(badSpread?.rejectionReasons.includes("spread_too_wide"));

const badReward = result.candidates.find(
  (candidate) => candidate.quote.symbol === "TEST-C130",
);
assert.equal(badReward?.eligible, false);
assert.ok(badReward?.rejectionReasons.includes("risk_reward_below_2"));

const expired = result.candidates.find(
  (candidate) => candidate.quote.symbol === "TEST-EXPIRED",
);
assert.equal(expired?.eligible, false);
assert.ok(expired?.rejectionReasons.includes("expired"));

const noEligible = rankVanillaOptionCandidates(
  100,
  [quotes[1]],
  {
    evaluationAt,
    targetUnderlyingPrice: 105,
    accountEquity: 100,
    referenceVolatility: 0.25,
    maxOneContractRiskPct: 1,
  },
  0.02,
  0,
);
assert.equal(noEligible.status, "no_eligible_candidates");
assert.equal(noEligible.selected, null);

// The IV solver still returns the expected market IV from the same quote.
const recoveredIv = impliedVolatility("CALL", {
  spot: 100,
  strike: 90,
  timeToExpiryYears: 60 / 365,
  riskFreeRate: 0.02,
  dividendYield: 0,
  marketPrice: marketMid,
});
assert.ok(Math.abs(recoveredIv - 0.2) < 1e-6);

assert.throws(
  () =>
    rankVanillaOptionCandidates(
      100,
      [],
      {
        evaluationAt,
        targetUnderlyingPrice: 110,
        accountEquity: 1000,
        referenceVolatility: 0.2,
        maxOneContractRiskPct: 2,
      },
    ),
  /maxOneContractRiskPct must be in \(0, 1\]/,
);

console.log("vanilla option candidate selector tests passed");
