import type { BrokerEnvironment } from "../broker.js";

export interface SaxoEnvironmentConfig {
  environment: BrokerEnvironment;
  apiBaseUrl: string;
  authenticationBaseUrl: string;
  streamingBaseUrl: string;
}

export interface SaxoRuntimeConfig {
  environment?: BrokerEnvironment;
  enableLiveReadOnly?: boolean;
}

const ENVIRONMENTS: Record<BrokerEnvironment, SaxoEnvironmentConfig> = {
  sim: {
    environment: "sim",
    apiBaseUrl: "https://gateway.saxobank.com/sim/openapi",
    authenticationBaseUrl: "https://sim.logonvalidation.net",
    streamingBaseUrl: "https://sim-streaming.saxobank.com/sim/oapi/streaming/ws",
  },
  live: {
    environment: "live",
    apiBaseUrl: "https://gateway.saxobank.com/openapi",
    authenticationBaseUrl: "https://live.logonvalidation.net",
    streamingBaseUrl: "https://live-streaming.saxobank.com/oapi/streaming/ws",
  },
};

function normalizeEnvironment(value: string | undefined): BrokerEnvironment {
  const normalized = value?.trim().toLowerCase() || "sim";
  if (normalized === "sim" || normalized === "live") return normalized;
  throw new Error("Invalid SAXO_ENVIRONMENT; expected sim or live");
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("Invalid SAXO_ENABLE_LIVE_READ_ONLY; expected true or false");
}

export function resolveSaxoEnvironment(
  config: SaxoRuntimeConfig = {},
): SaxoEnvironmentConfig {
  const environment = normalizeEnvironment(config.environment ?? process.env.SAXO_ENVIRONMENT);
  if (environment === "live") {
    const enabled = config.enableLiveReadOnly ?? parseBoolean(process.env.SAXO_ENABLE_LIVE_READ_ONLY);
    if (!enabled) {
      throw new Error(
        "Saxo LIVE read-only access is disabled; set SAXO_ENABLE_LIVE_READ_ONLY=true explicitly",
      );
    }
  }
  return ENVIRONMENTS[environment];
}
