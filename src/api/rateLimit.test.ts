import { strict as assert } from "node:assert";
import type { NextFunction, Request, Response } from "express";
import {
  createRateLimitMiddleware,
  getRequestClientKey,
  isHeavyApiRequest,
} from "./rateLimit.js";

function makeRequest(path = "/api/test"): Request {
  return {
    path,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    header(name: string): string | undefined {
      if (name.toLowerCase() === "x-forwarded-for") return "203.0.113.10, 10.0.0.1";
      return undefined;
    },
  } as unknown as Request;
}

function makeResponse(): {
  response: Response;
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
} {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;

  const response = {
    setHeader(name: string, value: string) {
      headers[name] = value;
      return response;
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
  } as unknown as Response;

  return {
    response,
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

const limiter = createRateLimitMiddleware({
  windowMs: 60_000,
  max: 2,
  key: (req) => getRequestClientKey(req),
});

let nextCalls = 0;
const next: NextFunction = () => {
  nextCalls += 1;
};

for (let i = 0; i < 2; i += 1) {
  const result = makeResponse();
  limiter(makeRequest(), result.response, next);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["RateLimit-Limit"], "2");
  assert.equal(result.headers["RateLimit-Remaining"], String(1 - i));
}

const blocked = makeResponse();
limiter(makeRequest(), blocked.response, next);
assert.equal(blocked.statusCode, 429);
assert.equal(nextCalls, 2);
assert.equal(blocked.headers["Retry-After"] !== undefined, true);
assert.deepEqual(blocked.body, {
  status: "error",
  error: "rate limit exceeded",
  retryAfterSeconds: Number(blocked.headers["Retry-After"]),
});

process.env.TRUST_PROXY = "true";
assert.equal(getRequestClientKey(makeRequest()), "203.0.113.10");
delete process.env.TRUST_PROXY;

assert.equal(isHeavyApiRequest(makeRequest("/api/analyze")), true);
assert.equal(isHeavyApiRequest(makeRequest("/api/backtest/benchmark")), true);
assert.equal(isHeavyApiRequest(makeRequest("/api/portfolio/run")), true);
assert.equal(isHeavyApiRequest(makeRequest("/api/metrics")), false);
assert.equal(isHeavyApiRequest(makeRequest("/health")), false);

console.log("rate-limit tests passed");
