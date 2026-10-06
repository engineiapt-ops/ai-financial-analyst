export type RuntimeConfigState = "ready" | "degraded" | "blocked";

export interface RuntimeConfigCheck {
  state: RuntimeConfigState;
  productionMode: boolean;
  configured: string[];
  missing: string[];
  invalid: string[];
  warnings: string[];
  detail: string;
}

import { parseEnvNumber, parseEnvUrl, parseStrictBoolean, trimEnvValue } from "../config/env.js";

function trimValue(value: string | undefined): string | undefined {
  return trimEnvValue(value);
}

function validPositiveNumber(value: string | undefined): boolean {
  if (!value) return true;
  return parseEnvNumber(value, { min: Number.MIN_VALUE }) !== undefined;
}

function validBoolean(value: string | undefined): boolean {
  if (!value) return true;
  return parseStrictBoolean(value) !== undefined;
}

function validUrl(value: string | undefined, protocols: string[]): boolean {
  if (!value) return true;
  return parseEnvUrl(value, protocols) !== undefined;
}

function validCorsOrigins(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  return value.split(",").map((origin) => origin.trim()).filter(Boolean).every((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
}

export function inspectRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfigCheck {
  const productionMode = env.NODE_ENV === "production" || Boolean(trimValue(env.VERCEL)) || Boolean(trimValue(env.RENDER));
  const configured: string[] = [];
  const missing: string[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];

  const requiredInProduction = ["DATABASE_URL", "API_AUTH_TOKEN", "CRON_SECRET"];

  for (const key of requiredInProduction) {
    if (trimValue(env[key])) configured.push(key);
    else if (productionMode) missing.push(key);
  }

  for (const key of [
    "BINANCE_REST_BASE",
    "BINANCE_WS_BASE",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "JEV_MODEL_VERSION",
    "PAPER_JEV_AUTORUN",
    "SERVE_STATIC",
    "DATABASE_SSL",
    "DATABASE_SSL_CA",
    "DB_POOL_MAX",
    "DB_STATEMENT_TIMEOUT_MS",
    "DATABASE_MIGRATE_URL",
    "JEV_BASE_URL",
    "AI_GATEWAY_API_KEY",
    "CORS_ORIGINS",
    "GEMINI_API_BASE",
    "GEMINI_TIMEOUT_MS",
    "TRUST_PROXY",
    "RATE_LIMIT_MAX",
    "RATE_LIMIT_HEAVY_MAX",
    "OBSERVABILITY_LOGS",
  ]) {
    if (trimValue(env[key])) configured.push(key);
  }

  if (!validPositiveNumber(env.GEMINI_TIMEOUT_MS)) invalid.push("GEMINI_TIMEOUT_MS");
  if (!validPositiveNumber(env.RATE_LIMIT_MAX)) invalid.push("RATE_LIMIT_MAX");
  if (!validPositiveNumber(env.RATE_LIMIT_HEAVY_MAX)) invalid.push("RATE_LIMIT_HEAVY_MAX");
  if (!validBoolean(env.TRUST_PROXY)) invalid.push("TRUST_PROXY");
  if (!validBoolean(env.OBSERVABILITY_LOGS)) invalid.push("OBSERVABILITY_LOGS");
  if (!validBoolean(env.PAPER_JEV_AUTORUN)) invalid.push("PAPER_JEV_AUTORUN");
  if (!validBoolean(env.SERVE_STATIC)) invalid.push("SERVE_STATIC");
  if (!validCorsOrigins(env.CORS_ORIGINS)) invalid.push("CORS_ORIGINS");

  const databaseSsl = trimValue(env.DATABASE_SSL);
  if (databaseSsl && !["disable", "require"].includes(databaseSsl)) {
    invalid.push("DATABASE_SSL");
  }

  const poolMax = parseEnvNumber(env.DB_POOL_MAX, { min: 1, max: 100 });
  if (trimValue(env.DB_POOL_MAX) && (!poolMax || !Number.isInteger(poolMax))) {
    invalid.push("DB_POOL_MAX");
  }

  if (!validUrl(env.DATABASE_MIGRATE_URL, ["postgres:", "postgresql:"])) {
    if (trimValue(env.DATABASE_MIGRATE_URL)) invalid.push("DATABASE_MIGRATE_URL");
  }

  if (!validUrl(env.BINANCE_REST_BASE?.trim(), ["http:", "https:"])) {
    invalid.push("BINANCE_REST_BASE");
  }
  if (!validUrl(env.BINANCE_WS_BASE?.trim(), ["ws:", "wss:"])) {
    invalid.push("BINANCE_WS_BASE");
  }
  if (!validUrl(env.GEMINI_API_BASE?.trim(), ["http:", "https:"])) {
    invalid.push("GEMINI_API_BASE");
  }

  if (productionMode && !trimValue(env.GEMINI_API_KEY)) {
    warnings.push("GEMINI_API_KEY is not configured; deterministic mode remains available");
  }

  if (productionMode && !trimValue(env.GEMINI_MODEL)) {
    warnings.push("GEMINI_MODEL is not configured; provider default will be used when Gemini is enabled");
  }

  if (productionMode && env.PAPER_JEV_AUTORUN !== "true") {
    warnings.push("PAPER_JEV_AUTORUN is not true; the paper JEV cycle is disabled");
  }

  if (productionMode && env.PAPER_JEV_AUTORUN === "true" && !trimValue(env.VERCEL)) {
    if (!trimValue(env.AI_GATEWAY_API_KEY)) missing.push("AI_GATEWAY_API_KEY");
    if (!trimValue(env.JEV_BASE_URL)) missing.push("JEV_BASE_URL");
  }

  if (productionMode && !trimValue(env.JEV_MODEL_VERSION)) {
    warnings.push("JEV_MODEL_VERSION is not configured; JEV model version pinning is disabled");
  }

  if (productionMode && !trimValue(env.CORS_ORIGINS)) {
    warnings.push("CORS_ORIGINS is empty in production");
    if (env.SERVE_STATIC !== "true") {
      missing.push("CORS_ORIGINS");
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    return {
      state: "blocked",
      productionMode,
      configured,
      missing,
      invalid,
      warnings,
      detail: "One or more required runtime settings are missing or invalid",
    };
  }

  if (warnings.length > 0) {
    return {
      state: "degraded",
      productionMode,
      configured,
      missing,
      invalid,
      warnings,
      detail: "Runtime configuration is usable with non-critical warnings",
    };
  }

  return {
    state: "ready",
    productionMode,
    configured,
    missing,
    invalid,
    warnings,
    detail: "Runtime configuration satisfies the current deployment contract",
  };
}
