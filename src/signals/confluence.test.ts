import { strict as assert } from "node:assert";
import {
  evaluateSignalConfluence,
  SIGNAL_CONFLUENCE_VERSION,
} from "./confluence.js";
import type { DecisionResult } from "../types.js";
import type { PriceActionSnapshot } from "../quant/priceAction.js";
import type { RegimeSnapshot } from "../risk/regime.js";

function decision(recomendacao: "BUY" | "SELL" | "WAIT"): DecisionResult {
  return {
    origem: "baseline",
    recomendacao,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : 1,
  };
}

function priceAction(bias: PriceActionSnapshot["bias"]): PriceActionSnapshot {
  return {
    version: "price-action-v1",
    bias,
    higherHigh: bias === "BULLISH",
    higherLow: bias === "BULLISH",
    lowerHigh: bias === "BEARISH",
    lowerLow: bias === "BEARISH",
    support: 99,
    resistance: 101,
  };
}

function regime(trend: RegimeSnapshot["trend"]): RegimeSnapshot {
  return {
    modelVersion: "regime-v1",
    dataAsOf: new Date("2026-10-05T15:00:00.000Z"),
    trend,
    volatility: "NORMAL",
    momentum: "NEUTRAL",
    key: `${trend}.NORMAL.NEUTRAL`,
    atrRelative: 0.01,
    emaSpreadPct: 0.2,
    rsi: 50,
    thresholdsVersion: "test-v1",
  };
}

const aligned = evaluateSignalConfluence({
  decision: decision("BUY"),
  context: {
    priceAction: {
      "1h": priceAction("BULLISH"),
      "4h": priceAction("BULLISH"),
      "1d": priceAction("NEUTRAL"),
    },
    regime: {
      "1h": regime("BULLISH"),
      "4h": regime("BULLISH"),
      "1d": regime("SIDEWAYS"),
    },
  },
});

assert.equal(aligned.version, SIGNAL_CONFLUENCE_VERSION);
assert.equal(aligned.status, "aligned");
assert.equal(aligned.reason, "aligned");
assert.equal(aligned.alignmentScore, 0.75);

const wait = evaluateSignalConfluence({
  decision: decision("WAIT"),
  context: {
    priceAction: {},
    regime: {},
  },
});

assert.equal(wait.status, "blocked");
assert.equal(wait.reason, "wait_decision");

const missing = evaluateSignalConfluence({
  decision: decision("SELL"),
  context: {
    priceAction: {
      "1h": priceAction("BEARISH"),
      "4h": priceAction("BEARISH"),
    },
    regime: {
      "1h": regime("BEARISH"),
      "4h": regime("BEARISH"),
    },
  },
});

assert.equal(missing.status, "blocked");
assert.equal(missing.reason, "missing_timeframe_data");

const htfVeto = evaluateSignalConfluence({
  decision: decision("BUY"),
  context: {
    priceAction: {
      "1h": priceAction("BULLISH"),
      "4h": priceAction("BULLISH"),
      "1d": priceAction("BULLISH"),
    },
    regime: {
      "1h": regime("BULLISH"),
      "4h": regime("BEARISH"),
      "1d": regime("BULLISH"),
    },
  },
});

assert.equal(htfVeto.status, "blocked");
assert.equal(htfVeto.reason, "higher_timeframe_contradiction");

const lowAlignment = evaluateSignalConfluence({
  decision: decision("SELL"),
  context: {
    priceAction: {
      "1h": priceAction("NEUTRAL"),
      "4h": priceAction("BEARISH"),
      "1d": priceAction("BULLISH"),
    },
    regime: {
      "1h": regime("SIDEWAYS"),
      "4h": regime("BEARISH"),
      "1d": regime("SIDEWAYS"),
    },
  },
});

assert.equal(lowAlignment.status, "blocked");
assert.equal(lowAlignment.reason, "insufficient_alignment");

assert.throws(
  () =>
    evaluateSignalConfluence({
      decision: decision("BUY"),
      context: { priceAction: {}, regime: {} },
      requiredTimeframes: [],
    }),
  /requiredTimeframes must not be empty/,
);

console.log("signal confluence tests passed");
