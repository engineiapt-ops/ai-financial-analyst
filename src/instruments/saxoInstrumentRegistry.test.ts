import { strict as assert } from "node:assert";
import { resolveSaxoInstrument, type SaxoFetch } from "./saxoInstrumentRegistry.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls: string[] = [];
const fetchImpl: SaxoFetch = async (input) => {
  const url = String(input);
  calls.push(url);

  if (url.includes("/ref/v1/instruments?")) {
    return jsonResponse({
      Data: [
        {
          AssetType: "FxSpot",
          Description: "Euro/US Dollar",
          Identifier: 21,
          Symbol: "EURUSD",
          CurrencyCode: "USD",
          ExchangeId: "SBFX",
          TradableAs: ["FxSpot"],
        },
      ],
    });
  }

  assert.match(url, /\/ref\/v1\/instruments\/details\/21\/FxSpot\?/);
  return jsonResponse({
    Data: [
      {
        AssetType: "FxSpot",
        Uic: 21,
        Symbol: "EURUSD",
        Description: "Euro/US Dollar",
        CurrencyCode: "USD",
        IsTradable: true,
        PrimaryListing: 21,
      },
    ],
  });
};

const resolved = await resolveSaxoInstrument("eurusd", {
  accessToken: "test-token",
  fetchImpl,
  minRequestIntervalMs: 0,
});

assert.deepEqual(resolved, {
  canonicalSymbol: "EURUSD",
  provider: "saxo-sim",
  providerInstrument: "FxSpot:21",
  status: "verified",
  symbol: "EURUSD",
  description: "Euro/US Dollar",
  assetType: "FxSpot",
  uic: 21,
  currencyCode: "USD",
  exchangeId: "SBFX",
  isTradable: true,
  source: "Saxo OpenAPI Reference Data (account-scoped verification)",
});
assert.equal(calls.length, 2);
assert.equal(calls[0].includes("AccountKey="), false);

console.log("saxo instrument registry resolved exact tradable instrument");

await assert.rejects(
  () =>
    resolveSaxoInstrument("EURUSD", {
      accessToken: "test-token",
      fetchImpl: async () =>
        jsonResponse({
          Data: [
            {
              AssetType: "Stock",
              Identifier: 21,
              Symbol: "EURUSD",
            },
          ],
        }),
      minRequestIntervalMs: 0,
    }),
  /No exact Saxo instrument match/,
);

await assert.rejects(
  () =>
    resolveSaxoInstrument("EURUSD", {
      accessToken: "test-token",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/ref/v1/instruments?")) {
          return jsonResponse({
            Data: [{ AssetType: "FxSpot", Identifier: 21, Symbol: "EURUSD" }],
          });
        }
        return jsonResponse({
          Data: [
            {
              AssetType: "FxSpot",
              Uic: 21,
              Symbol: "EURUSD",
              IsTradable: false,
            },
          ],
        });
      },
      minRequestIntervalMs: 0,
    }),
  /not tradable/,
);

await assert.rejects(
  () =>
    resolveSaxoInstrument("EURUSD", {
      accessToken: "test-token",
      fetchImpl: async () => jsonResponse({ error: "upstream" }, 503),
      minRequestIntervalMs: 0,
    }),
  /Saxo instrument registry request failed: HTTP 503/,
);

const accountCalls: string[] = [];
await resolveSaxoInstrument("EURUSD", {
  accessToken: "test-token",
  accountKey: "account-123",
  fetchImpl: async (input) => {
    const url = String(input);
    accountCalls.push(url);
    if (url.includes("/ref/v1/instruments?")) {
      return jsonResponse({
        Data: [{ AssetType: "FxSpot", Identifier: 21, Symbol: "EURUSD" }],
      });
    }
    return jsonResponse({
      Data: [
        {
          AssetType: "FxSpot",
          Uic: 21,
          Symbol: "EURUSD",
          Description: "Euro/US Dollar",
          IsTradable: true,
        },
      ],
    });
  },
  minRequestIntervalMs: 0,
});
assert(accountCalls.every((url) => url.includes("AccountKey=account-123")));
console.log("saxo instrument registry account scoping passed");

console.log("saxo instrument registry tests passed");
