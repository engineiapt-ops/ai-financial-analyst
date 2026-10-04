import assert from "node:assert/strict";
import { IgPriceProvider } from "./igPriceProvider.js";

function response(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), init });
  if (String(input).endsWith("/session")) {
    return response({}, { CST: "cst-test", "X-SECURITY-TOKEN": "security-test" });
  }
  if (String(input).includes("/markets/")) {
    return response({
      instrument: {
        epic: "CS.D.EURUSD.MINI.IP",
        name: "EUR/USD",
        symbol: "EURUSD",
        marketId: "EURUSD",
        type: "CURRENCIES",
        unit: "AMOUNT",
        contractSize: "1",
        lotSize: 1,
        expiry: "-",
        currencies: [{ symbol: "USD" }],
        marginDepositBands: [{
          currency: "EUR",
          min: 0,
          max: 100000,
          margin: 3.33,
          marginFactor: 3.33,
          marginFactorUnit: "PERCENTAGE",
        }],
        openingHours: {
          marketTimes: [{ openTime: "00:00", closeTime: "22:00" }],
        },
      },
      dealingRules: {
        minDealSize: { unit: "AMOUNT", value: 1 },
        minStepDistance: { unit: "POINTS", value: 0.1 },
        minNormalStopOrLimitDistance: { unit: "POINTS", value: 0.5 },
        minControlledRiskStopDistance: { unit: "POINTS", value: 1 },
        maxStopOrLimitDistance: { unit: "POINTS", value: 10000 },
      },
      snapshot: {
        bid: 1.082,
        offer: 1.083,
        snapshotTime: "2026-10-04T10:00:00",
        marketStatus: "TRADEABLE",
      },
    });
  }
  return response({
    prices: [{
      snapshotTimeUTC: "2026-10-04T09:00:00Z",
      openPrice: { bid: 1.08, ask: 1.081 },
      highPrice: { bid: 1.084, ask: 1.085 },
      lowPrice: { bid: 1.079, ask: 1.08 },
      closePrice: { bid: 1.083, ask: 1.084 },
      lastTradedVolume: 100,
    }],
  });
};

const provider = new IgPriceProvider({
  apiKey: "key",
  username: "demo-user",
  password: "demo-password",
  fetchImpl,
  minRequestIntervalMs: 0,
});

const market = await provider.getMarketDetails("CS.D.EURUSD.MINI.IP");
assert.equal(market.epic, "CS.D.EURUSD.MINI.IP");
assert.equal(market.symbol, "EURUSD");
assert.equal(market.lotSize, 1);
assert.equal(market.dealingRules.minDealSize.value, 1);
assert.equal(market.dealingRules.minStepDistance.unit, "POINTS");
assert.equal(market.marginDepositBands[0]?.currency, "EUR");
assert.equal(market.openingHours[0]?.openTime, "00:00");
assert.equal(market.snapshot.marketStatus, "TRADEABLE");

const quote = await provider.getQuote("CS.D.EURUSD.MINI.IP");
assert.equal(quote.bid, 1.082);
assert.equal(quote.ask, 1.083);
assert.equal(quote.marketStatus, "TRADEABLE");

const candles = await provider.getCandles({
  instrument: "CS.D.EURUSD.MINI.IP",
  timeframe: "1h",
  limit: 10,
});
assert.equal(candles.length, 1);
assert.equal(candles[0]?.close, 1.083);
assert.equal(candles[0]?.volume, 100);
assert.equal(
  provider.getMetadata({ instrument: "CS.D.EURUSD.MINI.IP", timeframe: "1h" }).quoteMode,
  "bid_ask",
);

const sessionCalls = calls.filter((call) => call.url.endsWith("/session"));
assert.equal(sessionCalls.length, 1);
const authHeaders = new Headers(calls[1]?.init?.headers);
assert.equal(authHeaders.get("CST"), "cst-test");
assert.equal(authHeaders.get("X-SECURITY-TOKEN"), "security-test");
assert.equal(authHeaders.get("X-IG-API-KEY"), "key");

console.log("igPriceProvider tests passed");


const failingProvider = new IgPriceProvider({
  apiKey: "key",
  username: "demo-user",
  password: "demo-password",
  minRequestIntervalMs: 0,
  fetchImpl: async () =>
    response(
      { errorCode: "error.security.account-not-yet-activated" },
      {},
      401,
    ),
});

await assert.rejects(
  () => failingProvider.getQuote("CS.D.EURUSD.MINI.IP"),
  /IG authentication failed: error\.security\.account-not-yet-activated/,
);

console.log("igPriceProvider error diagnostics test passed");
