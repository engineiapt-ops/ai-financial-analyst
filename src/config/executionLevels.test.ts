import assert from "node:assert/strict";
import {
  resolveExecutionLevels,
  priceLevelsFromPct,
  FALLBACK_TARGET_PCT,
  FALLBACK_STOP_PCT,
  ATR_MULTIPLIERS,
} from "./executionLevels.js";

const fb = resolveExecutionLevels({ price: 100, atr: null, timeframe: "1h" });
assert.equal(fb.source, "fallback");
assert.equal(fb.targetPct, FALLBACK_TARGET_PCT);
assert.equal(fb.stopPct, FALLBACK_STOP_PCT);

const h1 = resolveExecutionLevels({ price: 100, atr: 1, timeframe: "1h" });
assert.equal(h1.source, "atr");
assert.ok(h1.targetPct > h1.stopPct);
assert.ok(h1.targetPct <= ATR_MULTIPLIERS["1h"].maxTargetPct);

const d1 = resolveExecutionLevels({ price: 100, atr: 2, timeframe: "1d" });
assert.ok(d1.targetPct >= h1.targetPct);

const buy = priceLevelsFromPct(100, "BUY", 0.01, 0.005);
assert.equal(buy.entrada, 100);
assert.ok(Math.abs(buy.alvo - 101) < 1e-9);
assert.ok(Math.abs(buy.stop - 99.5) < 1e-9);

const sell = priceLevelsFromPct(100, "SELL", 0.01, 0.005);
assert.ok(Math.abs(sell.alvo - 99) < 1e-9);
assert.ok(Math.abs(sell.stop - 100.5) < 1e-9);

console.log("executionLevels tests passed");
