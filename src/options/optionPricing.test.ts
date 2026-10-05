import { strict as assert } from "node:assert";
import {
  blackScholesGreeks,
  blackScholesPrice,
  impliedVolatility,
  VANILLA_OPTIONS_MODEL_VERSION,
  valueVanillaOption,
} from "./optionPricing.js";

const base = {
  spot: 100,
  strike: 100,
  timeToExpiryYears: 1,
  riskFreeRate: 0.05,
  volatility: 0.2,
  dividendYield: 0,
};

const call = valueVanillaOption("CALL", base);
const put = valueVanillaOption("PUT", base);

assert.equal(call.version, VANILLA_OPTIONS_MODEL_VERSION);
assert.equal(call.type, "CALL");
assert.ok(Math.abs(call.price - 10.4506) < 0.01);
assert.ok(Math.abs(put.price - 5.5735) < 0.01);

// European put-call parity.
const parity = call.price - put.price - (
  base.spot - base.strike * Math.exp(-base.riskFreeRate * base.timeToExpiryYears)
);
assert.ok(Math.abs(parity) < 0.01);

const greeks = blackScholesGreeks("CALL", base);
assert.ok(Math.abs(greeks.delta - 0.63683) < 0.001);
assert.ok(Math.abs(greeks.gamma - 0.01876) < 0.0002);
assert.ok(Math.abs(greeks.vega - 37.524) < 0.02);
assert.ok(Math.abs(greeks.theta - (-6.414)) < 0.02);
assert.ok(Math.abs(greeks.rho - 53.232) < 0.03);
assert.equal(greeks.vegaPerOnePctVol, greeks.vega * 0.01);
assert.equal(greeks.thetaPerDay, greeks.theta / 365);
assert.equal(greeks.rhoPerOneBp, greeks.rho * 0.0001);

// IV round trip for both sides.
const recoveredCallIv = impliedVolatility("CALL", {
  spot: base.spot,
  strike: base.strike,
  timeToExpiryYears: base.timeToExpiryYears,
  riskFreeRate: base.riskFreeRate,
  dividendYield: base.dividendYield,
  marketPrice: call.price,
});
assert.ok(Math.abs(recoveredCallIv - base.volatility) < 1e-6);

const recoveredPutIv = impliedVolatility("PUT", {
  spot: base.spot,
  strike: base.strike,
  timeToExpiryYears: base.timeToExpiryYears,
  riskFreeRate: base.riskFreeRate,
  dividendYield: base.dividendYield,
  marketPrice: put.price,
});
assert.ok(Math.abs(recoveredPutIv - base.volatility) < 1e-6);

// Dividend yield changes the theoretical call value and delta.
const dividendCall = valueVanillaOption("CALL", {
  ...base,
  dividendYield: 0.02,
});
assert.ok(dividendCall.price < call.price);
assert.ok(dividendCall.greeks.delta < call.greeks.delta);

// Invalid inputs are fail-closed.
assert.throws(
  () => blackScholesPrice("CALL", { ...base, spot: 0 }),
  /spot must be greater than zero/,
);
assert.throws(
  () => impliedVolatility("CALL", {
    spot: 100,
    strike: 100,
    timeToExpiryYears: 1,
    riskFreeRate: 0.05,
    dividendYield: 0,
    marketPrice: 200,
  }),
  /OPTION_IV_OUT_OF_BOUNDS/,
);

// A market price at intrinsic boundary returns the finite lower bound.
const intrinsicCall = impliedVolatility("CALL", {
  spot: 120,
  strike: 100,
  timeToExpiryYears: 1,
  riskFreeRate: 0,
  dividendYield: 0,
  marketPrice: 20,
});
assert.equal(intrinsicCall, 1e-6);

console.log("vanilla options pricing tests passed");
