import { strict as assert } from "node:assert";
import type { Request, Response } from "express";
import {
  API_AUTH_TOKEN_HEADER,
  hasValidApiToken,
  isProtectedApiRequest,
  requireApiAuth,
} from "./auth.js";

function makeRequest(
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
): Request {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    path,
    method,
    header(name: string): string | undefined {
      return normalized[name.toLowerCase()];
    },
  } as unknown as Request;
}

function assertAuthBehavior(path: string, method = "GET"): void {
  assert.equal(isProtectedApiRequest(makeRequest(path, method)), true);

  let unauthorizedStatus: number | undefined;
  const unauthorizedResponse = {
    status(code: number) {
      unauthorizedStatus = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;

  requireApiAuth()(
    makeRequest(path, method),
    unauthorizedResponse,
    () => {
      throw new Error("unauthorized request unexpectedly reached next()");
    },
  );
  assert.equal(unauthorizedStatus, 401);

  let nextCalled = false;
  const authorizedResponse = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;

  requireApiAuth()(
    makeRequest(path, method, { [API_AUTH_TOKEN_HEADER]: "test-secret" }),
    authorizedResponse,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
}

process.env.API_AUTH_TOKEN = "test-secret";

assert.equal(
  hasValidApiToken(
    makeRequest("/api/analyze", "POST", { [API_AUTH_TOKEN_HEADER]: "test-secret" }),
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

[
  ["/api/metrics", "GET"],
  ["/api/evaluation/overview", "GET"],
  ["/api/evaluation/calibration", "GET"],
  ["/api/evaluation/portfolio-overview", "GET"],
  ["/api/evaluation/portfolio-walk-forward", "GET"],
  ["/api/evaluation/portfolio-regimes", "GET"],
  ["/api/evaluation/operational-quality", "GET"],
  ["/api/system/validation", "GET"],
  ["/api/system/validation/history", "GET"],
  ["/api/evaluation/pipeline-audit/history", "GET"],
  ["/api/product/continuous-governance", "GET"],
  ["/api/evaluation/settlement-audit", "GET"],
].forEach(([path, method]) => assertAuthBehavior(path, method));

assertAuthBehavior("/api/analyze", "POST");
assertAuthBehavior("/api/report", "POST");
assertAuthBehavior("/api/market/info", "GET");
assertAuthBehavior("/api/market/klines", "GET");

assert.equal(isProtectedApiRequest(makeRequest("/health", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/market/ping", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/market/time", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/system/readiness", "GET")), false);

// Cron keeps its separate CRON_SECRET authentication rather than API_AUTH_TOKEN.
assert.equal(isProtectedApiRequest(makeRequest("/api/cron/paper-jev-cycle", "GET")), false);

delete process.env.API_AUTH_TOKEN;

console.log("api auth tests passed");
