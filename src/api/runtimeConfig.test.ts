import { strict as assert } from "node:assert";
import { inspectRuntimeConfig } from "./runtimeConfig.js";

const base = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://example",
  API_AUTH_TOKEN: "secret",
  BINANCE_REST_BASE: "https://api.binance.com",
  BINANCE_WS_BASE: "wss://stream.binance.com:9443/ws",
  GEMINI_API_KEY: "gemini-secret",
  GEMINI_MODEL: "gemini-3.8-flash",
  JEV_MODEL_VERSION: "jev-2026-09",
  GEMINI_API_BASE: "https://generativelanguage.googleapis.com/v1beta",
  GEMINI_TIMEOUT_MS: "30000",
  TRUST_PROXY: "false",
  RATE_LIMIT_MAX: "120",
  RATE_LIMIT_HEAVY_MAX: "20",
  OBSERVABILITY_LOGS: "true",
};

const ready = inspectRuntimeConfig(base);
assert.equal(ready.state, "ready");
assert.deepEqual(ready.missing, []);
assert.deepEqual(ready.invalid, []);

const missing = inspectRuntimeConfig({
  ...base,
  DATABASE_URL: "",
  API_AUTH_TOKEN: "",
});
assert.equal(missing.state, "blocked");
assert.deepEqual(missing.missing, ["DATABASE_URL", "API_AUTH_TOKEN"]);

const invalid = inspectRuntimeConfig({
  ...base,
  RATE_LIMIT_MAX: "abc",
  GEMINI_API_BASE: "not-a-url",
});
assert.equal(invalid.state, "blocked");
assert.equal(invalid.invalid.includes("RATE_LIMIT_MAX"), true);
assert.equal(invalid.invalid.includes("GEMINI_API_BASE"), true);

const deterministic = inspectRuntimeConfig({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://example",
  API_AUTH_TOKEN: "secret",
});
assert.equal(deterministic.state, "degraded");
assert.equal(deterministic.warnings.some((warning) => warning.includes("GEMINI_API_KEY")), true);
assert.equal(deterministic.warnings.some((warning) => warning.includes("JEV_MODEL_VERSION")), true);

const dev = inspectRuntimeConfig({ NODE_ENV: "development" });
assert.equal(dev.state, "ready");
assert.deepEqual(dev.missing, []);

console.log("runtime config tests passed");
