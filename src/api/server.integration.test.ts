import { strict as assert } from "node:assert";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.API_AUTH_TOKEN = "integration-secret";
process.env.CRON_SECRET = "cron-secret";

const { app } = await import("./server.js");

const server = http.createServer(app);

function listen(): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to resolve integration test port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

const port = await listen();
const baseUrl = "http://127.0.0.1:" + port;

try {
  const health = await fetch(baseUrl + "/health");
  assert.equal(health.status, 200);
  assert.equal(Boolean(health.headers.get("x-request-id")), true);
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: "ai-financial-analyst-api",
  });

  const unauthorized = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(Boolean(unauthorized.headers.get("x-request-id")), true);
  assert.deepEqual(await unauthorized.json(), {
    status: "error",
    error: "unauthorized",
  });

  const wrongBearer = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong-secret",
    },
    body: JSON.stringify({}),
  });
  assert.equal(wrongBearer.status, 401);

  const wrongHeader = await fetch(baseUrl + "/api/report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "wrong-secret",
    },
    body: JSON.stringify({}),
  });
  assert.equal(wrongHeader.status, 401);

  const cronUnauthorized = await fetch(baseUrl + "/api/cron/paper-jev-cycle");
  assert.equal(cronUnauthorized.status, 401);

  const cronDisabled = await fetch(baseUrl + "/api/cron/paper-jev-cycle", {
    headers: {
    "x-api-key": "integration-secret",
    authorization: "Bearer cron-secret",
  },
  });
  assert.equal(cronDisabled.status, 200);
  assert.deepEqual(await cronDisabled.json(), {
    status: "ok",
    enabled: false,
    note: "PAPER_JEV_AUTORUN is not enabled",
  });

  console.log("API integration tests passed");
} finally {
  await close();
  delete process.env.API_AUTH_TOKEN;
  delete process.env.CRON_SECRET;
}
