import { strict as assert } from "node:assert";
import {
  buildSystemReadinessOverview,
  SYSTEM_READINESS_VERSION,
} from "./systemReadiness.js";

const ready = buildSystemReadinessOverview({
  generatedAt: new Date("2026-09-26T18:00:00.000Z"),
  marketData: { available: true, detail: "Binance ping OK" },
  database: { available: true, detail: "Database query OK" },
  aiProviders: [
    { id: "none", configured: true, enabled: true },
    { id: "gemini", configured: true, enabled: true },
  ],
  paperTradingOnly: true,
  apiAuthenticationConfigured: true,
  runtimeConfig: {
    state: "ready",
    productionMode: true,
    configured: ["DATABASE_URL", "API_AUTH_TOKEN"],
    missing: [],
    invalid: [],
    warnings: [],
    detail: "Runtime configuration is valid",
  },
  governanceContracts: [
    "evaluation-overview.v1",
    "portfolio-governance-overview.v1",
  ],
});

assert.equal(ready.version, SYSTEM_READINESS_VERSION);
assert.equal(ready.state, "ready");
assert.deepEqual(ready.checks.aiProviders.configured, ["none", "gemini"]);
assert.equal(ready.checks.execution.paperTradingOnly, true);

const degraded = buildSystemReadinessOverview({
  generatedAt: new Date("2026-09-26T18:00:00.000Z"),
  marketData: { available: false, detail: "timeout" },
  database: { available: false, detail: "DATABASE_URL is missing" },
  aiProviders: [
    { id: "none", configured: true, enabled: true },
    { id: "gemini", configured: false, enabled: false },
  ],
  paperTradingOnly: true,
  apiAuthenticationConfigured: false,
  runtimeConfig: {
    state: "blocked",
    productionMode: true,
    configured: [],
    missing: ["DATABASE_URL", "API_AUTH_TOKEN"],
    invalid: [],
    warnings: [],
    detail: "missing",
  },
  governanceContracts: ["evaluation-overview.v1"],
});

assert.equal(degraded.state, "blocked");
assert.equal(degraded.checks.marketData.state, "degraded");
assert.equal(degraded.checks.database.state, "degraded");
assert.equal(degraded.checks.aiProviders.state, "ready");
assert.equal(degraded.checks.authentication.state, "blocked");
assert.equal(degraded.checks.governance.state, "degraded");

const blocked = buildSystemReadinessOverview({
  generatedAt: new Date("2026-09-26T18:00:00.000Z"),
  marketData: { available: true, detail: "ok" },
  database: { available: true, detail: "ok" },
  aiProviders: [{ id: "none", configured: true, enabled: true }],
  paperTradingOnly: false,
  apiAuthenticationConfigured: true,
  runtimeConfig: {
    state: "ready",
    productionMode: true,
    configured: ["DATABASE_URL", "API_AUTH_TOKEN"],
    missing: [],
    invalid: [],
    warnings: [],
    detail: "Runtime configuration is valid",
  },
  governanceContracts: [
    "evaluation-overview.v1",
    "portfolio-governance-overview.v1",
  ],
});

assert.equal(blocked.state, "blocked");
assert.equal(blocked.checks.execution.state, "blocked");

console.log("system readiness tests passed");
