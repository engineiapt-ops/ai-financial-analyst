import assert from "node:assert/strict";
import { SaxoBrokerClient } from "./saxoBroker.js";
import { resolveSaxoEnvironment } from "./saxoConfig.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), init });

  if (String(input).includes("/accounts/me")) {
    return response({
      Data: [
        {
          AccountKey: "account-key",
          AccountId: "SIM-123",
          Currency: "EUR",
          AccountType: "Normal",
          Active: true,
        },
      ],
    });
  }

  return response({
    AccountKey: "account-key",
    AccountId: "SIM-123",
    Currency: "EUR",
    AccountType: "Normal",
    Active: true,
  });
};

const sim = new SaxoBrokerClient({
  environment: "sim",
  accessToken: "test-token",
  fetchImpl,
  minRequestIntervalMs: 0,
});

assert.equal(sim.id, "saxo");
assert.equal(sim.environment, "sim");
assert.equal(sim.executionEnabled, false);

const accounts = await sim.getAccounts();
assert.deepEqual(accounts, [
  {
    accountKey: "account-key",
    accountId: "SIM-123",
    currency: "EUR",
    accountType: "Normal",
    active: true,
  },
]);

const account = await sim.getAccount("account-key");
assert.deepEqual(account, accounts[0]);

const headers = new Headers(calls[0]?.init?.headers);
assert.equal(headers.get("Authorization"), "Bearer test-token");
assert.equal(calls[0]?.url, "https://gateway.saxobank.com/sim/openapi/port/v1/accounts/me?$top=100");

const live = resolveSaxoEnvironment({
  environment: "live",
  enableLiveReadOnly: true,
});
assert.equal(live.apiBaseUrl, "https://gateway.saxobank.com/openapi");
assert.equal(live.authenticationBaseUrl, "https://live.logonvalidation.net");
assert.equal(live.streamingBaseUrl, "https://live-streaming.saxobank.com/oapi/streaming/ws");

assert.throws(
  () => resolveSaxoEnvironment({ environment: "live" }),
  /SAXO_ENABLE_LIVE_READ_ONLY=true/,
);

assert.throws(
  () => resolveSaxoEnvironment({ environment: "invalid" as "sim" }),
  /Invalid SAXO_ENVIRONMENT/,
);

console.log("saxoBroker tests passed");
