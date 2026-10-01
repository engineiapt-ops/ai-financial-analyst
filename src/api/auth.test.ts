import { strict as assert } from "node:assert";
import type { Request, Response } from "express";
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

 
function makeResponse(): { response: Response; statusCode: number | undefined } {
  let statusCode: number | undefined;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json() {
      return response;
    },
  } as unknown as Response;
  return { response, get statusCode() { return statusCode; } };
}

function assertProtectedRoute(path: string, method = "GET"): void {
  assert.equal(isProtectedApiRequest(makeRequest(path, method)), true);

  const blocked = makeResponse();
  let blockedNext = 0;
  requireApiAuth()(makeRequest(path, method), blocked.response, () => { blockedNext += 1; });
  assert.equal(blocked.statusCode, 401);
  assert.equal(blockedNext, 0);

  const allowed = makeResponse();
  let allowedNext = 0;
  requireApiAuth()(
    makeRequest(path, method, { [API_AUTH_TOKEN_HEADER]: "test-secret" }),
    allowed.response,
    () => { allowedNext += 1; },
  );
  assert.equal(allowedNext, 1);
  assert.equal(allowed.statusCode, undefined);
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
const protectedRoutes: Array<[string, string]> = [
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
  ["/api/analyze", "POST"],
  ["/api/analyze/ticker", "POST"],
  ["/api/report", "POST"],
];

for (const [path, method] of protectedRoutes) {
  assertProtectedRoute(path, method);
}

for (const [path, method] of [
  ["/health", "GET"],
  ["/api/market/ping", "GET"],
  ["/api/market/time", "GET"],
  ["/api/system/readiness", "GET"],
] as const) {
  assert.equal(isProtectedApiRequest(makeRequest(path, method)), false);
}

assert.equal(isProtectedApiRequest(makeRequest("/api/market/ping", "POST")), true);
assert.equal(isProtectedApiRequest(makeRequest("/api/cron/paper-jev-cycle", "GET")), false);

delete process.env.API_AUTH_TOKEN;

console.log("api auth tests passed");
