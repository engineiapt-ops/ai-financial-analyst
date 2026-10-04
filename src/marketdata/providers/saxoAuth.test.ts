import assert from "node:assert/strict";
import { SaxoOAuthClient } from "./saxoAuth.js";

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), init });
  return new Response(JSON.stringify({
    access_token: "access-test",
    refresh_token: "refresh-test",
    expires_in: 1200,
    token_type: "Bearer",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const client = new SaxoOAuthClient({
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3000/api/saxo/oauth/callback",
  authenticationBaseUrl: "https://sim.logonvalidation.net",
  fetchImpl,
});

const authorization = client.createAuthorizationUrl("state-test");
const authorizationUrl = new URL(authorization.url);
assert.equal(authorization.state, "state-test");
assert.equal(authorizationUrl.pathname, "/authorize");
assert.equal(authorizationUrl.searchParams.get("client_id"), "client-id");
assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "http://localhost:3000/api/saxo/oauth/callback");
assert.equal(authorizationUrl.searchParams.get("response_type"), "code");

const token = await client.exchangeCode("code-test");
assert.equal(token.access_token, "access-test");
assert.equal(token.expires_in, 1200);
assert.equal(calls.length, 1);
assert.equal(calls[0]?.url, "https://sim.logonvalidation.net/token");

const headers = new Headers(calls[0]?.init?.headers);
assert.match(headers.get("Authorization") ?? "", /^Basic /);
assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");

console.log("saxoAuth tests passed");
