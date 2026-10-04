import assert from "node:assert/strict";
import {
  buildExecutableSignal,
  EXECUTABLE_SIGNAL_VERSION,
  ESTIMATED_ROUND_TRIP_COST_PCT,
} from "./executableSignal.js";

const dataAsOf = new Date("2026-10-01T11:00:00.000Z");

const ready = buildExecutableSignal({
  ativo: "BTCUSDT",
  timeframe: "1h",
  dataAsOf,
  decision: {
    origem: "jev",
    recomendacao: "BUY",
    tamanhoPosicaoPct: 1.5,
  },
  entryPrice: 100,
  atr: 1,
});

assert.equal(ready.version, EXECUTABLE_SIGNAL_VERSION);
assert.equal(ready.status, "ready");
assert.equal(ready.reason, "ready");
assert.equal(ready.side, "BUY");
assert.equal(ready.entrada, 100);
assert.ok((ready.alvo ?? 0) > ready.entrada!);
assert.ok((ready.stop ?? 0) < ready.entrada!);
assert.ok((ready.targetPct ?? 0) > ESTIMATED_ROUND_TRIP_COST_PCT);
assert.equal(ready.positionSizePct, 1.5);
assert.equal(ready.execution?.source, "atr");
assert.equal(ESTIMATED_ROUND_TRIP_COST_PCT, 0.003);

const wait = buildExecutableSignal({
  ativo: "BTCUSDT",
  timeframe: "1h",
  dataAsOf,
  decision: {
    origem: "jev",
    recomendacao: "WAIT",
    tamanhoPosicaoPct: 0,
  },
  entryPrice: 100,
  atr: 1,
});

assert.equal(wait.status, "not_executable");
assert.equal(wait.reason, "wait_decision");
assert.equal(wait.side, null);

const invalidPrice = buildExecutableSignal({
  ativo: "BTCUSDT",
  timeframe: "1h",
  dataAsOf,
  decision: {
    origem: "jev",
    recomendacao: "BUY",
    tamanhoPosicaoPct: 1.5,
  },
  entryPrice: 0,
  atr: 1,
});

assert.equal(invalidPrice.status, "not_executable");
assert.equal(invalidPrice.reason, "invalid_price");

const expensive = buildExecutableSignal({
  ativo: "BTCUSDT",
  timeframe: "1h",
  dataAsOf,
  decision: {
    origem: "baseline",
    recomendacao: "BUY",
    tamanhoPosicaoPct: 1.5,
  },
  entryPrice: 100,
  atr: ESTIMATED_ROUND_TRIP_COST_PCT / 2 * 100,
});

assert.equal(expensive.status, "not_executable");
assert.equal(expensive.reason, "cost_filter");
assert.equal(expensive.side, null);
assert.ok((expensive.targetPct ?? 0) <= ESTIMATED_ROUND_TRIP_COST_PCT);

console.log("executable signal tests passed");
