import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";

const testEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "https://app.example.test",
};

test("health is liveness-only and readiness reports a database outage as 503", async () => {
  let pingCount = 0;
  const app = await buildApp({
    env: testEnv,
    db: {
      async ping() {
        pingCount += 1;
        throw new Error("database credentials must not be exposed");
      },
    },
  });

  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: "ok" });
    assert.equal(pingCount, 0);

    const ready = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(ready.statusCode, 503);
    assert.deepEqual(ready.json().error.code, "DATABASE_UNAVAILABLE");
    assert.equal(ready.json().error.message, "Readiness check failed");
    assert.equal(ready.json().error.requestId, ready.headers["x-request-id"]);
    assert.equal(ready.body.includes("credentials"), false);
    assert.equal(pingCount, 1);
  } finally {
    await app.close();
  }
});

test("the API denies origins outside CORS_ORIGINS with the standard error contract", async () => {
  const app = await buildApp({
    env: testEnv,
    db: { async ping() {} },
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1",
      headers: { origin: "https://untrusted.example.test" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "CORS_ORIGIN_DENIED");
    assert.equal(response.json().error.requestId, response.headers["x-request-id"]);
  } finally {
    await app.close();
  }
});

test("the standard rate limit is configurable and returns the standard error contract", async () => {
  const app = await buildApp({
    env: { ...testEnv, RATE_LIMIT_MAX: "2", RATE_LIMIT_HEAVY_MAX: "1" },
    db: { async ping() {} },
    registerV1Routes(scope) {
      scope.get("/standard-contract", async () => ({ ok: true }));
    },
  });

  try {
    assert.equal((await app.inject({ method: "GET", url: "/v1/standard-contract" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/v1/standard-contract" })).statusCode, 200);

    const limited = await app.inject({ method: "GET", url: "/v1/standard-contract" });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, "RATE_LIMIT_EXCEEDED");
    assert.equal(limited.json().error.requestId, limited.headers["x-request-id"]);
  } finally {
    await app.close();
  }
});

test("heavy routes can use their independent configurable limit", async () => {
  const app = await buildApp({
    env: { ...testEnv, RATE_LIMIT_MAX: "20", RATE_LIMIT_HEAVY_MAX: "1" },
    db: { async ping() {} },
    registerV1Routes(scope, limits) {
      scope.get("/heavy-contract", {
        config: { rateLimit: limits.heavy },
      }, async () => ({ ok: true }));
    },
  });

  try {
    assert.equal((await app.inject({ method: "GET", url: "/v1/heavy-contract" })).statusCode, 200);

    const limited = await app.inject({ method: "GET", url: "/v1/heavy-contract" });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, "RATE_LIMIT_EXCEEDED");
  } finally {
    await app.close();
  }
});

test("unknown routes use the standard error format and every response has a request id", async () => {
  const app = await buildApp({
    env: testEnv,
    db: { async ping() {} },
  });

  try {
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "NOT_FOUND");
    assert.ok(response.headers["x-request-id"]);
    assert.equal(response.json().error.requestId, response.headers["x-request-id"]);
  } finally {
    await app.close();
  }
});
