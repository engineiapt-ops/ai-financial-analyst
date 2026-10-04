import assert from "node:assert/strict";
import {
  isLegacyStockAnalystEnabled,
  isLegacyStockAnalystPath,
} from "./stockAnalystGate.js";

assert.equal(isLegacyStockAnalystEnabled({ ENABLE_STOCK_ANALYST: "true" }), true);
assert.equal(isLegacyStockAnalystEnabled({ ENABLE_STOCK_ANALYST: "false" }), false);
assert.equal(isLegacyStockAnalystEnabled({}), false);

assert.equal(isLegacyStockAnalystPath("/api/market/overview"), true);
assert.equal(isLegacyStockAnalystPath("/api/analyze/ticker"), true);
assert.equal(isLegacyStockAnalystPath("/api/analyze/ledger"), true);
assert.equal(isLegacyStockAnalystPath("/api/valuation/dcf"), true);
assert.equal(isLegacyStockAnalystPath("/api/research/memo"), true);
assert.equal(isLegacyStockAnalystPath("/api/briefing/tts"), true);
assert.equal(isLegacyStockAnalystPath("/api/copilot/chat"), true);
assert.equal(isLegacyStockAnalystPath("/api/market/ping"), false);

console.log("stock analyst gate tests passed");
