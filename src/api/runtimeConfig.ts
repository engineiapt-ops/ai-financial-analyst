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

function trimValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validPositiveNumber(value: string | undefined): boolean {
  if (!value) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function validBoolean(value: string | undefined): boolean {
  if (!value) return true;
  return value === "true" || value === "false";
}

function validUrl(value: string | undefined, protocols: string[]): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

export function inspectRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfigCheck {
  const productionMode = env.NODE_ENV === "production" || env.VERCEL === "1" || env.VERCEL === "true";
  const configured: string[] = [];
  const missing: string[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];

  const requiredInProduction = ["DATABASE_URL", "API_AUTH_TOKEN"];

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

  if (productionMode && !trimValue(env.JEV_MODEL_VERSION)) {
    warnings.push("JEV_MODEL_VERSION is not configured; the gateway-reported Jev version will be recorded when available, otherwise unreported");
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
