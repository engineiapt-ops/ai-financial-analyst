import { strict as assert } from "node:assert";
import {
  DEFAULT_INSTRUMENT_SYMBOL,
  getInstrument,
  listEnabledInstruments,
} from "./registry.js";

assert.equal(DEFAULT_INSTRUMENT_SYMBOL, "BTCUSDT");
assert.equal(getInstrument("btcusdt").symbol, "BTCUSDT");
assert.equal(getInstrument("BTCUSDT").venue, "binance_spot");
assert.deepEqual(
  listEnabledInstruments().map((item) => item.symbol),
  ["BTCUSDT"],
);
assert.equal(getInstrument("EURUSD").enabled, false);
assert.equal(getInstrument("EURUSD").venue, "saxo");
assert.equal(getInstrument("EURUSD").dataProvider, "saxo-sim");
assert.equal(getInstrument("EURUSD").metadataStatus, "pending_broker_confirmation");
assert.equal(getInstrument("EURUSD").spread, null);
assert.equal(getInstrument("US500").leverage, null);
assert.throws(() => getInstrument("UNKNOWN"));

console.log("instrument registry tests passed");
