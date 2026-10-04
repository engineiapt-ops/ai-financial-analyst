import { strict as assert } from "node:assert";
import { assertSupportedTimeframe } from "./integration.js";

assertSupportedTimeframe("1h");
assertSupportedTimeframe("4h");
assertSupportedTimeframe("1d");
assert.throws(() => assertSupportedTimeframe("15m"), /Unsupported market data timeframe/);

console.log("market data integration tests passed");
