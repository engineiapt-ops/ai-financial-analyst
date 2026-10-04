import { strict as assert } from "node:assert";
import { buildExecutableSignal } from "../signals/executableSignal.js";
import { validatePaperSignal, PAPER_VALIDATION_VERSION } from "./paperValidation.js";
import type { CfdQuoteCandle } from "./executionModelV3.js";

function candle(openTime: string, values: Partial<CfdQuoteCandle> = {}): CfdQuoteCandle {
  const base = {
    openTime: new Date(openTime),
    closeTime: new Date(new Date(openTime).getTime() + 3_600_000 - 1),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    bidOpen: 99.9,
    askOpen: 100.1,
    bidHigh: 100.9,
    askHigh: 101.1,
    bidLow: 98.9,
    askLow: 99.1,
    bidClose: 99.9,
    askClose: 100.1,
    volume: 1,
  };
  return { ...base, ...values };
}

const signal = buildExecutableSignal({
  ativo: "BTCUSDT",
  timeframe: "1h",
  dataAsOf: new Date("2026-10-01T11:00:00.000Z"),
  decision: {
    origem: "baseline",
    recomendacao: "BUY",
    tamanhoPosicaoPct: 10,
  },
  entryPrice: 100,
  atr: 1,
});

assert.equal(signal.status, "ready");

const validated = validatePaperSignal({
  signal,
  signalCandle: candle("2026-10-01T10:00:00Z"),
  futureCandles: [
    candle("2026-10-01T11:00:00Z", {
      bidHigh: 101.5,
      askHigh: 101.6,
      bidLow: 100,
      askLow: 100.1,
      bidClose: 101,
      askClose: 101.1,
      high: 101.6,
      low: 100,
      close: 101.1,
    }),
  ],
  executionConfig: {
    commissionPctPerSide: 0.01,
    slippagePctPerSide: 0,
    overnightFinancingPctPerDay: 0,
    leverage: 10,
    stopOutMarginLevelPct: 0,
  },
});

assert.equal(validated.version, PAPER_VALIDATION_VERSION);
assert.equal(validated.status, "validated");
assert.equal(validated.reason, "validated");
assert.equal(validated.riskPct, 0.1);
assert.equal(validated.trade?.outcome, "win");

const blockedRisk = validatePaperSignal({
  signal: { ...signal, positionSizePct: 100 },
  signalCandle: candle("2026-10-01T10:00:00Z"),
  futureCandles: [],
  executionConfig: {
    commissionPctPerSide: 0,
    slippagePctPerSide: 0,
    overnightFinancingPctPerDay: 0,
    leverage: 10,
    stopOutMarginLevelPct: 0,
  },
});

assert.equal(blockedRisk.status, "blocked");
assert.equal(blockedRisk.reason, "risk_limit");
assert.equal(blockedRisk.riskPct, 1);

const notReady = validatePaperSignal({
  signal: { ...signal, status: "not_executable", side: null, targetPct: null, stopPct: null },
  signalCandle: candle("2026-10-01T10:00:00Z"),
  futureCandles: [],
  executionConfig: {
    commissionPctPerSide: 0,
    slippagePctPerSide: 0,
    overnightFinancingPctPerDay: 0,
    leverage: 10,
    stopOutMarginLevelPct: 0,
  },
});

assert.equal(notReady.status, "blocked");
assert.equal(notReady.reason, "signal_not_ready");

console.log("paper validation tests passed");
