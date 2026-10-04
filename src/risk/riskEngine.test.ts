import assert from "node:assert/strict";
import { FIXED_POSITION_PCT } from "../config/thresholds.js";
import {
  evaluateRisk,
  evaluateRiskV2,
  applyRiskToDecision,
  RISK_POSITION_SIZE_PCT,
  DEFAULT_RISK_POLICY,
  MAX_RISK_PER_TRADE_HARD_CAP_PCT,
} from "./riskEngine.js";
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

const legacy = evaluateRisk(decision, baseRegime);
assert.equal(legacy.allowed, true);
assert.equal(legacy.reason, "risk_ok");
assert.equal(legacy.positionSizePct, FIXED_POSITION_PCT);
assert.equal(legacy.maxGrossExposurePct, 15);
assert.equal(RISK_POSITION_SIZE_PCT, FIXED_POSITION_PCT);

const v2 = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
  stopDistancePct: 1,
});
assert.equal(v2.allowed, true);
assert.equal(v2.riskAmount, 5);
assert.equal(v2.positionSizePct, 15);
assert.equal(v2.riskPerTradePct, DEFAULT_RISK_POLICY.maxRiskPerTradePct);

const widerStop = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
  stopDistancePct: 2,
});
assert.equal(widerStop.positionSizePct, 15);

const dailyLoss = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 2,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
  stopDistancePct: 1,
});
assert.equal(dailyLoss.allowed, false);
assert.equal(dailyLoss.reason, "daily_loss_limit");

const tradeLimit = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 5,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
  stopDistancePct: 1,
});
assert.equal(tradeLimit.reason, "trade_limit");

const positionLimit = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 3,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
  stopDistancePct: 1,
});
assert.equal(positionLimit.reason, "position_limit");

const exposureLimit = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 14,
    consecutiveLosses: 0,
  },
  stopDistancePct: 1,
});
assert.equal(exposureLimit.allowed, true);
assert.equal(exposureLimit.positionSizePct, 1);

const correlationLimit = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 1,
    grossExposurePct: 0,
    consecutiveLosses: 0,
    correlationToOpenPositions: 0.81,
  },
  stopDistancePct: 1,
});
assert.equal(correlationLimit.reason, "correlation_limit");

const lossStreak = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 3,
  },
  stopDistancePct: 1,
});
assert.equal(lossStreak.reason, "consecutive_loss_limit");

const eventBlocked = evaluateRiskV2({
  decision,
  regime: baseRegime,
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
    eventBlocked: true,
  },
  stopDistancePct: 1,
});
assert.equal(eventBlocked.reason, "event_block");

const highVol = evaluateRiskV2({
  decision,
  regime: { ...baseRegime, volatility: "HIGH", key: "BULLISH.HIGH.POSITIVE" },
  state: {
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  },
  stopDistancePct: 1,
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
assert.equal(elevated.positionSizePct, FIXED_POSITION_PCT * 0.5);

console.log("risk engine tests passed");


assert.equal(MAX_RISK_PER_TRADE_HARD_CAP_PCT, 1);
assert.throws(
  () => evaluateRiskV2({
    decision,
    regime: baseRegime,
    state: {
      equity: 1000,
      dailyLossPct: 0,
      tradesToday: 0,
      openPositions: 0,
      grossExposurePct: 0,
      consecutiveLosses: 0,
    },
    stopDistancePct: 1,
    policy: { maxRiskPerTradePct: 1.01 },
  }),
  /Invalid risk policy/,
);
