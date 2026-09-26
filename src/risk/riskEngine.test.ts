import assert from "node:assert/strict";
import { evaluateRisk, applyRiskToDecision } from "./riskEngine.js";
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
  tamanhoPosicaoPct: 2,
};

const ok = evaluateRisk(decision, baseRegime);
assert.equal(ok.allowed, true);
assert.equal(ok.reason, "risk_ok");

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

console.log("risk engine tests passed");
