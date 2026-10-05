import { strict as assert } from "node:assert";
import {
  buildConfluentExecutableSignal,
  CONFLUENT_EXECUTABLE_SIGNAL_VERSION,
} from "./executableSignalV2.js";
import type { SignalConfluenceResult } from "./confluence.js";

const dataAsOf = new Date("2026-10-05T15:00:00.000Z");

function confluence(
  status: SignalConfluenceResult["status"],
  reason: SignalConfluenceResult["reason"] = "aligned",
): SignalConfluenceResult {
  return {
    version: "signal-confluence-v1",
    status,
    side: status === "aligned" ? "BUY" : "BUY",
    requiredTimeframes: ["1h", "4h", "1d"],
    evaluatedTimeframes: 3,
    directionalObservations: 6,
    alignedObservations: status === "aligned" ? 6 : 2,
    alignmentScore: status === "aligned" ? 1 : 2 / 6,
    reason,
    details: [],
  };
}

const ready = buildConfluentExecutableSignal({
  signal: {
    ativo: "BTCUSDT",
    timeframe: "1h",
    dataAsOf,
    decision: {
      origem: "baseline",
      recomendacao: "BUY",
      tamanhoPosicaoPct: 1.5,
    },
    entryPrice: 100,
    atr: 1,
  },
  confluence: confluence("aligned"),
});

assert.equal(ready.version, CONFLUENT_EXECUTABLE_SIGNAL_VERSION);
assert.equal(ready.status, "ready");
assert.equal(ready.reason, "ready");
assert.equal(ready.confluence.status, "aligned");
assert.equal(ready.side, "BUY");
assert.ok((ready.targetPct ?? 0) >= (ready.stopPct ?? 0) * 2);

const vetoed = buildConfluentExecutableSignal({
  signal: {
    ativo: "BTCUSDT",
    timeframe: "1h",
    dataAsOf,
    decision: {
      origem: "baseline",
      recomendacao: "BUY",
      tamanhoPosicaoPct: 1.5,
    },
    entryPrice: 100,
    atr: 1,
  },
  confluence: confluence("blocked", "higher_timeframe_contradiction"),
});

assert.equal(vetoed.version, CONFLUENT_EXECUTABLE_SIGNAL_VERSION);
assert.equal(vetoed.status, "not_executable");
assert.equal(vetoed.reason, "confluence_filter");
assert.equal(vetoed.positionSizePct, 0);
assert.equal(vetoed.execution, null);

const waitDecision = buildConfluentExecutableSignal({
  signal: {
    ativo: "BTCUSDT",
    timeframe: "1h",
    dataAsOf,
    decision: {
      origem: "baseline",
      recomendacao: "WAIT",
      tamanhoPosicaoPct: 0,
    },
    entryPrice: 100,
    atr: 1,
  },
  confluence: confluence("aligned"),
});

assert.equal(waitDecision.status, "not_executable");
assert.equal(waitDecision.reason, "wait_decision");

const expensive = buildConfluentExecutableSignal({
  signal: {
    ativo: "BTCUSDT",
    timeframe: "1h",
    dataAsOf,
    decision: {
      origem: "baseline",
      recomendacao: "BUY",
      tamanhoPosicaoPct: 1.5,
    },
    entryPrice: 100,
    atr: 1,
    roundTripCostPct: 0.02,
  },
  confluence: confluence("aligned"),
});

assert.equal(expensive.status, "not_executable");
assert.equal(expensive.reason, "cost_filter");

console.log("executable signal v2 tests passed");
