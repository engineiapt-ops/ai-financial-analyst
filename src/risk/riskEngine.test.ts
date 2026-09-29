import assert from "node:assert/strict";
import { FIXED_POSITION_PCT } from "../config/thresholds.js";
import { evaluateRisk, applyRiskToDecision, RISK_POSITION_SIZE_PCT } from "./riskEngine.js";
import type { RegimeSnapshot } from "./regime.js";

const baseRegime: RegimeSnapshot = {
  modelVersion: "regime-v1",
  dataAsOf: new Date("2026-09-26T00:00:00Z"),
  trend: "BULLISH",
  volatility: "NORMAL",
  momentum: "POSITIVE",
  key: "BULLISH.NORMAL.POSITIVE",
  atrRelative: 0.01,
  emaSpreadPct: 0.5,
  rsi: 60,
  thresholdsVersion: "regime-v1",
};

const decision = {
  origem: "baseline" as const,
  recomendacao: "BUY" as const,
  tamanhoPosicaoPct: FIXED_POSITION_PCT,
};

const ok = evaluateRisk(decision, baseRegime);
assert.equal(ok.allowed, true);
assert.equal(ok.reason, "risk_ok");
assert.equal(ok.positionSizePct, FIXED_POSITION_PCT);
assert.equal(RISK_POSITION_SIZE_PCT, FIXED_POSITION_PCT);

const highVol = evaluateRisk(decision, {
  ...baseRegime,
  volatility: "HIGH",
  key: "BULLISH.HIGH.POSITIVE",
});
assert.equal(highVol.allowed, false);
assert.equal(highVol.reason, "high_volatility");

const blocked = applyRiskToDecision(decision, highVol);
assert.equal(blocked.recomendacao, "WAIT");
assert.equal(blocked.tamanhoPosicaoPct, 0);

const elevated = evaluateRisk(
  { ...decision, riscoElevado: true, tamanhoPosicaoPct: FIXED_POSITION_PCT },
  baseRegime,
);
assert.equal(elevated.allowed, true);
assert.ok(elevated.positionSizePct < FIXED_POSITION_PCT);

console.log("risk engine tests passed");
