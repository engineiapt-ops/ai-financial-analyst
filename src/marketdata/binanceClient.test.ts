import { strict as assert } from "node:assert";
import { fetchKlines, getExchangeInfo, getServerTime, ping, tfToInterval } from "./binanceClient.js";

const originalFetch = globalThis.fetch;

try {
  assert.equal(tfToInterval("1h"), "1h");
  assert.equal(tfToInterval("4h"), "4h");
  assert.equal(tfToInterval("1d"), "1d");

  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    if (requestedUrl.includes("/api/v3/ping")) return new Response("{}", { status: 200 });
    if (requestedUrl.includes("/api/v3/time")) return new Response(JSON.stringify({ serverTime: 123456 }), { status: 200 });
    if (requestedUrl.includes("/api/v3/exchangeInfo")) {
      return new Response(JSON.stringify({
        symbols: [{ symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", isSpotTradingAllowed: true }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify([[
      1700000000000, "100", "110", "90", "105", "12", 1700003599999,
    ]]), { status: 200 });
  };

  assert.equal(await ping(), true);
  assert.equal(await getServerTime(), 123456);
  assert.deepEqual(await getExchangeInfo(), {
    symbol: "BTCUSDT",
    status: "TRADING",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    isSpotTradingAllowed: true,
  });

  const klines = await fetchKlines("btcusdt", "1h", { limit: 9999, startTime: 10, endTime: 20 });
  assert.equal(klines.length, 1);
  assert.equal(klines[0].open, 100);
  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get("symbol"), "BTCUSDT");
  assert.equal(params.get("interval"), "1h");
  assert.equal(params.get("limit"), "1000");
  assert.equal(params.get("startTime"), "10");
  assert.equal(params.get("endTime"), "20");

  globalThis.fetch = async () => new Response("bad", { status: 500, statusText: "Server Error" });
  await assert.rejects(ping(), /Binance ping falhou com status HTTP 500/);

  console.log("binance client tests passed");
} finally {
  globalThis.fetch = originalFetch;
}
