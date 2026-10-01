import { strict as assert } from "node:assert";
import { fetchKlines, tfToInterval } from "./binanceClient.js";

assert.equal(tfToInterval("1h"), "1h");
assert.equal(tfToInterval("4h"), "4h");
assert.equal(tfToInterval("1d"), "1d");

const originalFetch = globalThis.fetch;
let requestedUrl = "";
globalThis.fetch = async (input) => {
  requestedUrl = String(input);
  return new Response(
    JSON.stringify([
      [1000, "100", "110", "90", "105", "12.5", 1999],
    ]),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

try {
  const result = await fetchKlines("btcusdt", "1h", { limit: 2000, startTime: 1000, endTime: 2000 });
  assert.equal(result.length, 1);
  assert.equal(result[0].close, 105);
  assert.match(requestedUrl, /symbol=BTCUSDT/);
  assert.match(requestedUrl, /interval=1h/);
  assert.match(requestedUrl, /limit=1000/);
  assert.match(requestedUrl, /startTime=1000/);
  assert.match(requestedUrl, /endTime=2000/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("binance client tests passed");
