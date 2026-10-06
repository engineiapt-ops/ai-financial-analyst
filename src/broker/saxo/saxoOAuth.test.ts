import assert from "node:assert/strict";
import { SaxoOAuthClient } from "./saxoOAuth.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), init });
  return response({
    access_token: "access-test",
    refresh_token: "refresh-test",
    expires_in: 1200,
    token_type: "Bearer",
    refresh_token_expires_in: 2400,
  });
};

const client = new SaxoOAuthClient({
  environment: "sim",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://api.example.test/api/saxo/oauth/callback",
  fetchImpl,
  minRequestIntervalMs: 0,
});

const authorization = client.createAuthorizationUrl("state-test");
const authorizationUrl = new URL(authorization.url);
assert.equal(authorization.state, "state-test");
assert.equal(authorizationUrl.pathname, "/authorize");
assert.equal(authorizationUrl.searchParams.get("client_id"), "client-id");
assert.equal(
  authorizationUrl.searchParams.get("redirect_uri"),
  "https://api.example.test/api/saxo/oauth/callback",
);
assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
assert.equal(authorizationUrl.searchParams.get("state"), "state-test");

const token = await client.exchangeCode("code-test");
assert.equal(token.access_token, "access-test");
assert.equal(token.expires_in, 1200);
assert.equal(token.refresh_token_expires_in, 2400);
assert.equal(calls.length, 1);
assert.equal(calls[0]?.url, "https://sim.logonvalidation.net/token");

const firstHeaders = new Headers(calls[0]?.init?.headers);
assert.match(firstHeaders.get("Authorization") ?? "", /^Basic /);
assert.equal(
  firstHeaders.get("Content-Type"),
  "application/x-www-form-urlencoded",
);

const body = String(calls[0]?.init?.body ?? "");
assert.match(body, /grant_type=authorization_code/);
assert.match(body, /code=code-test/);

const refreshed = await client.refreshToken("refresh-test");
assert.equal(refreshed.access_token, "access-test");
assert.equal(calls.length, 2);
assert.match(String(calls[1]?.init?.body ?? ""), /grant_type=refresh_token/);
assert.match(String(calls[1]?.init?.body ?? ""), /refresh_token=refresh-test/);

await assert.rejects(
  () => client.exchangeCode(" "),
  /Saxo authorization code is required/,
);

await assert.rejects(
  () => client.refreshToken(" "),
  /Saxo refresh token is required/,
);

await assert.rejects(
  () =>
    new SaxoOAuthClient({
      environment: "live",
      enableLiveReadOnly: false,
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://api.example.test/callback",
      minRequestIntervalMs: 0,
    }),
  /SAXO_ENABLE_LIVE_READ_ONLY=true/,
);

await assert.rejects(
  () =>
    new SaxoOAuthClient({
      environment: "sim",
      clientId: "",
      clientSecret: "client-secret",
      redirectUri: "https://api.example.test/callback",
      minRequestIntervalMs: 0,
    }),
  /SAXO_CLIENT_ID/,
);

const failingClient = new SaxoOAuthClient({
  environment: "sim",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://api.example.test/callback",
  fetchImpl: async () =>
    response(
      { error: "invalid_grant", error_description: "invalid authorization code" },
      400,
    ),
  minRequestIntervalMs: 0,
});

await assert.rejects(
  () => failingClient.exchangeCode("bad-code"),
  /HTTP 400 - invalid authorization code/,
);

console.log("saxoOAuth tests passed");
