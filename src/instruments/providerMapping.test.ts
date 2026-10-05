import { strict as assert } from "node:assert";
import {
  getProviderInstrumentMapping,
  resolveProviderInstrument,
} from "./providerMapping.js";

const saxo = getProviderInstrumentMapping("eurusd", "SAXO-SIM");
assert.ok(saxo);
assert.equal(saxo?.status, "verified");
assert.equal(saxo?.providerInstrument, "FxSpot:21");
assert.equal(resolveProviderInstrument("EURUSD", "saxo-sim"), "FxSpot:21");
assert.equal(resolveProviderInstrument("btcusdt", "BINANCE"), "BTCUSDT");

const igPending = getProviderInstrumentMapping("EURUSD", "ig-demo");
assert.ok(igPending);
assert.equal(igPending?.status, "pending_broker_confirmation");
assert.equal(igPending?.providerInstrument, null);
assert.throws(
  () => resolveProviderInstrument("EURUSD", "ig-demo"),
  /mapping is not verified/i,
);

assert.throws(
  () => resolveProviderInstrument("US500", "ig-demo"),
  /No provider instrument mapping/i,
);
assert.throws(() => resolveProviderInstrument("", "saxo-sim"));

console.log("provider instrument mapping tests passed");
