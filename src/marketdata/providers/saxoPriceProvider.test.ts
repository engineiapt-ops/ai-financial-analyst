import assert from "node:assert/strict";
import { SaxoPriceProvider } from "./saxoPriceProvider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), init });
  if (String(input).includes("/trade/v1/infoprices")) {
    return response({
      AssetType: "FxSpot",
      Uic: 21,
      LastUpdated: "2026-10-04T10:00:00Z",
      Quote: {
        Bid: 1.1247,
        Ask: 1.1249,
        Mid: 1.1248,
        MarketState: "Open",
        DelayedByMinutes: 0,
        ErrorCode: "None",
      },
    });
  }

  return response({
    Data: [{
      Time: "2026-10-04T09:00:00Z",
      OpenBid: 1.1230,
      HighBid: 1.1250,
      LowBid: 1.1220,
      CloseBid: 1.1240,
      Open: 1.1231,
      High: 1.1251,
      Low: 1.1221,
      Close: 1.1241,
      Volume: 1000,
    }],
  });
};

const provider = new SaxoPriceProvider({
  accessToken: "token",
  fetchImpl,
  minRequestIntervalMs: 0,
});

const quote = await provider.getQuote("FxSpot:21");
assert.equal(quote.uic, 21);
assert.equal(quote.assetType, "FxSpot");
assert.equal(quote.bid, 1.1247);
assert.equal(quote.ask, 1.1249);
assert.equal(quote.mid, 1.1248);

const candles = await provider.getCandles({
  instrument: "FxSpot:21",
  timeframe: "1h",
  limit: 10,
});
assert.equal(candles.length, 1);
assert.equal(candles[0]?.open, 1.1230);
assert.equal(candles[0]?.close, 1.1240);
assert.equal(candles[0]?.volume, 1000);

const chartCall = calls.find((call) => call.url.includes("/chart/v3/charts"));
assert.ok(chartCall);
assert.match(chartCall.url, /AssetType=FxSpot/);
assert.match(chartCall.url, /Uic=21/);
assert.match(chartCall.url, /Horizon=60/);
assert.match(chartCall.url, /Count=10/);

const authHeaders = new Headers(calls[0]?.init?.headers);
assert.equal(authHeaders.get("Authorization"), "Bearer token");

assert.equal(
  provider.getMetadata({ instrument: "FxSpot:21", timeframe: "1h" }).provider,
  "saxo-sim",
);

await assert.rejects(
  () => provider.getCandles({ instrument: "EURUSD", timeframe: "1h", limit: 10 }),
  /AssetType:UIC/,
);

console.log("saxoPriceProvider tests passed");
