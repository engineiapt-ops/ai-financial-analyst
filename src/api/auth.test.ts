import { strict as assert } from "node:assert";
import type { Request } from "express";
import {
  API_AUTH_TOKEN_HEADER,
  hasValidApiToken,
  isProtectedApiRequest,
} from "./auth.js";

function makeRequest(
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
): Request {
  return {
    path,
    method,
    header(name: string): string | undefined {
      return headers[name.toLowerCase()] ?? headers[name];
    },
  } as unknown as Request;
}

process.env.API_AUTH_TOKEN = "test-secret";

assert.equal(
  hasValidApiToken(
    makeRequest("/api/analyze", "POST", { [API_AUTH_TOKEN_HEADER.toLowerCase()]: "test-secret" }),
  ),
  true,
);
assert.equal(
  hasValidApiToken(
    makeRequest("/api/analyze", "POST", { authorization: "Bearer test-secret" }),
  ),
  true,
);
assert.equal(
  hasValidApiToken(
    makeRequest("/api/analyze", "POST", { authorization: "Bearer wrong" }),
  ),
  false,
);

assert.equal(isProtectedApiRequest(makeRequest("/api/analyze", "POST")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/report", "POST")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/research/snapshots/rs_123", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/overview", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/decisions/12", "POST")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/metrics", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/health", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/backtest/benchmark", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/portfolio/run", "GET")), true);

delete process.env.API_AUTH_TOKEN;

console.log("api auth tests passed");
