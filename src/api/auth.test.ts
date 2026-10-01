import { strict as assert } from "node:assert";
import type { Request } from "express";
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
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/overview", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/kpis", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/oos-report", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/pipeline-audit", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/product/governance-dashboard", "GET")), true);
assert.equal(
  isProtectedApiRequest(makeRequest("/api/evaluation/pipeline-audit/snapshots", "POST")),
  true,
);
assert.equal(
  isProtectedApiRequest(makeRequest("/api/product/continuous-governance/check", "POST")),
  true,
);
assert.equal(
  isProtectedApiRequest(makeRequest("/api/evaluation/pipeline-audit/snapshots", "GET")),
  true,
);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/decisions/12", "POST")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/metrics", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/overview", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/calibration", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/portfolio-overview", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/portfolio-walk-forward", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/portfolio-regimes", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/operational-quality", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/system/validation", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/system/validation/history", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/pipeline-audit/history", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/product/continuous-governance", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/evaluation/settlement-audit", "GET")), true);

for (const path of ["/api/metrics","/api/evaluation/overview","/api/evaluation/calibration","/api/evaluation/portfolio-overview","/api/evaluation/portfolio-walk-forward","/api/evaluation/portfolio-regimes","/api/evaluation/operational-quality","/api/system/validation","/api/system/validation/history","/api/evaluation/pipeline-audit/history","/api/product/continuous-governance","/api/evaluation/settlement-audit"]) {
  const unauthorizedReq = makeRequest(path);
  assert.equal(isProtectedApiRequest(unauthorizedReq), true);
  let unauthorizedStatus = 0;
  requireApiAuth()(unauthorizedReq, {
    status(code: number) { unauthorizedStatus = code; return this; },
    json() { return this; },
  } as any, () => {
    throw new Error(`unauthorized request unexpectedly reached next: ${path}`);
  });
  assert.equal(unauthorizedStatus, 401);

  let nextCalled = false;
  requireApiAuth()(makeRequest(path, "GET", {
    [API_AUTH_TOKEN_HEADER.toLowerCase()]: "test-secret",
  }), {
    status() { return this; },
    json() { return this; },
  } as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
}

assert.equal(isProtectedApiRequest(makeRequest("/health", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/market/ping", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/market/time", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/system/readiness", "GET")), false);
assert.equal(isProtectedApiRequest(makeRequest("/api/backtest/benchmark", "GET")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/portfolio/run", "GET")), true);

delete process.env.API_AUTH_TOKEN;

console.log("api auth tests passed");
