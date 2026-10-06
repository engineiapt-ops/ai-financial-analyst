import { strict as assert } from "node:assert";
import { inspectRuntimeConfig } from "./runtimeConfig.js";

const base = {
  NODE_ENV: "production",
  RENDER: "true",
  DATABASE_URL: "postgres://example",
  API_AUTH_TOKEN: "secret",
  CRON_SECRET: "cron-secret",
  PAPER_JEV_AUTORUN: "true",
  BINANCE_REST_BASE: "https://api.binance.com",
  BINANCE_WS_BASE: "wss://stream.binance.com:9443/ws",
  GEMINI_API_KEY: "gemini-secret",
  GEMINI_MODEL: "gemini-3.8-flash",
  JEV_BASE_URL: "https://jev.example.test",
  AI_GATEWAY_API_KEY: "gateway-secret",
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
  CRON_SECRET: "cron-secret",
  PAPER_JEV_AUTORUN: "false",
});
assert.equal(deterministic.state, "degraded");
assert.equal(deterministic.warnings.some((warning) => warning.includes("GEMINI_API_KEY")), true);
assert.equal(deterministic.warnings.some((warning) => warning.includes("PAPER_JEV_AUTORUN")), true);
assert.equal(deterministic.warnings.some((warning) => warning.includes("JEV_MODEL_VERSION")), true);

const paperJevWithoutPin = inspectRuntimeConfig({
  ...base,
  JEV_MODEL_VERSION: "",
  PAPER_JEV_AUTORUN: "true",
});
assert.equal(paperJevWithoutPin.state, "blocked");
assert.equal(paperJevWithoutPin.missing.includes("JEV_MODEL_VERSION"), true);

const invalidPaperFlag = inspectRuntimeConfig({
  ...base,
  PAPER_JEV_AUTORUN: "1",
});
assert.equal(invalidPaperFlag.state, "blocked");
assert.equal(invalidPaperFlag.invalid.includes("PAPER_JEV_AUTORUN"), true);

const invalidRenderSettings = inspectRuntimeConfig({
  ...base,
  DATABASE_SSL: "maybe",
  DB_POOL_MAX: "2.5",
  SERVE_STATIC: "maybe",
  DATABASE_MIGRATE_URL: "https://example.com",
});
assert.equal(invalidRenderSettings.state, "blocked");
assert.equal(invalidRenderSettings.invalid.includes("DATABASE_SSL"), true);
assert.equal(invalidRenderSettings.invalid.includes("DB_POOL_MAX"), true);
assert.equal(invalidRenderSettings.invalid.includes("SERVE_STATIC"), true);
assert.equal(invalidRenderSettings.invalid.includes("DATABASE_MIGRATE_URL"), true);

const productionWithoutCors = inspectRuntimeConfig({
  ...base,
  CORS_ORIGINS: "",
  SERVE_STATIC: "false",
});
assert.equal(productionWithoutCors.state, "blocked");
assert.equal(productionWithoutCors.missing.includes("CORS_ORIGINS"), true);

const productionStaticWithoutCors = inspectRuntimeConfig({
  ...base,
  CORS_ORIGINS: "",
  SERVE_STATIC: "true",
});
assert.equal(productionStaticWithoutCors.state, "degraded");
assert.equal(productionStaticWithoutCors.warnings.some((warning) => warning.includes("CORS_ORIGINS")), true);

const missingCronSecret = inspectRuntimeConfig({
  ...base,
  CRON_SECRET: "",
});
assert.equal(missingCronSecret.state, "blocked");
assert.equal(missingCronSecret.missing.includes("CRON_SECRET"), true);

const missingJevService = inspectRuntimeConfig({
  ...base,
  AI_GATEWAY_API_KEY: "",
  JEV_BASE_URL: "",
});
assert.equal(missingJevService.state, "blocked");
assert.equal(missingJevService.missing.includes("JEV_BASE_URL"), true);
assert.equal(missingJevService.missing.includes("AI_GATEWAY_API_KEY"), true);

const dev = inspectRuntimeConfig({ NODE_ENV: "development" });
assert.equal(dev.state, "ready");
assert.deepEqual(dev.missing, []);

console.log("runtime config tests passed");
