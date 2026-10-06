import { strict as assert } from "node:assert";
import http from "node:http";

import { isLegacyStockAnalystPath } from "../legacy/stockAnalystGate.js";

process.env.NODE_ENV = "test";
process.env.API_AUTH_TOKEN = "integration-secret";
process.env.CRON_SECRET = "cron-secret";

const { app } = await import("../../server.js");
const { app: coreApiApp } = await import("./server.js");

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
  const healthBody = await health.json();
  assert.deepEqual(healthBody, {
    status: "ok",
    service: "ai-financial-analyst-api",
  });

  const readiness = await fetch(baseUrl + "/health/ready");
  assert.equal([200, 503].includes(readiness.status), true);
  const readinessBody = await readiness.json();
  assert.equal(["ok", "error"].includes(readinessBody.status), true);
  assert.equal(["ok", "error"].includes(readinessBody.db), true);
  assert.equal(typeof readinessBody.version, "string");
  assert.equal(typeof readinessBody.commit, "string");

  const overviewUnauthorized = await fetch(baseUrl + "/api/market/overview");
  assert.equal(overviewUnauthorized.status, 404);
  assert.deepEqual(await overviewUnauthorized.json(), {
    error: "legacy stock analyst disabled",
    code: "LEGACY_STOCK_ANALYST_DISABLED",
  });

  const overviewAuthorized = await fetch(baseUrl + "/api/market/overview", {
    headers: { "x-api-key": "integration-secret" },
  });
  assert.equal(overviewAuthorized.status, 404);
  assert.deepEqual(await overviewAuthorized.json(), {
    error: "legacy stock analyst disabled",
    code: "LEGACY_STOCK_ANALYST_DISABLED",
  });

  const unauthorized = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(unauthorized.status, 401);
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


  const originalGlobalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.endsWith("/api/v3/ping")) {
      return new Response("{}", { status: 200 });
    }

    return originalGlobalFetch(input, init);
  }) as typeof fetch;

  try {
    const readinessPublic = await fetch(baseUrl + "/api/system/readiness");
    assert.equal(readinessPublic.status, 200);
    const readinessPublicPayload = await readinessPublic.json() as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(readinessPublicPayload).sort(),
      ["ready", "status", "timestamp"],
    );
    assert.equal(
      readinessPublicPayload.status === "ok" || readinessPublicPayload.status === "degraded",
      true,
    );
    assert.equal(typeof readinessPublicPayload.ready, "boolean");
    assert.equal(typeof readinessPublicPayload.timestamp, "string");

    const publicSerialized = JSON.stringify(readinessPublicPayload).toLowerCase();
    for (const forbidden of ["missing", "invalid", "warnings", "detail", "contracts"]) {
      assert.equal(
        publicSerialized.includes(forbidden),
        false,
        `public readiness leaked forbidden field: ${forbidden}`,
      );
    }

    const readinessDetailsUnauthorized = await originalGlobalFetch(
      baseUrl + "/api/system/readiness/details",
    );
    assert.equal(readinessDetailsUnauthorized.status, 401);

    const readinessDetailsAuthorized = await originalGlobalFetch(
      baseUrl + "/api/system/readiness/details",
      { headers: { "x-api-key": "integration-secret" } },
    );
    assert.equal(readinessDetailsAuthorized.status, 200);
    const readinessDetailsPayload = await readinessDetailsAuthorized.json() as {
      checks: {
        configuration: Record<string, unknown>;
        database: Record<string, unknown>;
        governance: Record<string, unknown>;
      };
    };
    assert.equal(typeof readinessDetailsPayload.checks.configuration, "object");
    assert.equal(Array.isArray(readinessDetailsPayload.checks.governance.contracts), true);
    assert.equal(
      JSON.stringify(readinessDetailsPayload).includes("DATABASE_URL is required"),
      true,
    );
  } finally {
    globalThis.fetch = originalGlobalFetch;
  }

  const routePathSet = new Set<string>();
  const routers = [app, coreApiApp];
  for (const routerOwner of routers) {
    const router = (routerOwner as typeof routerOwner & {
      router?: { stack?: Array<{ route?: { path?: string | string[] } }> };
      _router?: { stack?: Array<{ route?: { path?: string | string[] } }> };
    }).router ?? (routerOwner as typeof routerOwner & {
      _router?: { stack?: Array<{ route?: { path?: string | string[] } }> };
    })._router;
    for (const layer of router?.stack ?? []) {
      const path = layer.route?.path;
      if (typeof path === "string") routePathSet.add(path);
      if (Array.isArray(path)) for (const item of path) routePathSet.add(item);
    }
  }

  const publicApiRoutes = new Set([
    "/api/market/ping",
    "/api/market/time",
    "/api/system/readiness",
  ]);
  const discoveredProtectedRoutes = [...routePathSet]
    .filter(
      (path) =>
        path.startsWith("/api/") &&
        !publicApiRoutes.has(path) &&
        !isLegacyStockAnalystPath(path),
    );

  assert.equal(discoveredProtectedRoutes.length > 0, true);
  for (const path of discoveredProtectedRoutes) {
    const response = await fetch(baseUrl + path);
    assert.equal(
      response.status,
      401,
      `API route must reject unauthenticated access: ${path}`,
    );
  }

  const cronUnauthorized = await fetch(baseUrl + "/api/cron/paper-jev-cycle");
  assert.equal(cronUnauthorized.status, 401);

  const cronDisabled = await fetch(baseUrl + "/api/cron/paper-jev-cycle", {
    headers: { authorization: "Bearer cron-secret" },
  });
  assert.equal(cronDisabled.status, 503);
  assert.deepEqual(await cronDisabled.json(), {
    status: "error",
    code: "PAPER_JEV_AUTORUN_DISABLED",
    error: "Paper JEV cycle is disabled by runtime configuration",
  });

  console.log("API integration tests passed");
} finally {
  await close();
  delete process.env.API_AUTH_TOKEN;
  delete process.env.CRON_SECRET;
}
