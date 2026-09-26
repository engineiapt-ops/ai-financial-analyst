export const SYSTEM_READINESS_VERSION = "system-readiness.v1";

export type ReadinessState = "ready" | "degraded" | "blocked";

export interface SystemReadinessOverview {
  version: typeof SYSTEM_READINESS_VERSION;
  generatedAt: string;
  state: ReadinessState;
  checks: {
    api: { state: "ready"; detail: string };
    authentication: {
      state: "ready" | "blocked";
      configured: boolean;
      detail: string;
    };
    marketData: { state: ReadinessState; detail: string };
    database: { state: ReadinessState; detail: string };
    aiProviders: {
      state: ReadinessState;
      configured: string[];
      detail: string;
    };
    execution: {
      state: "ready" | "blocked";
      paperTradingOnly: boolean;
      detail: string;
    };
    governance: {
      state: ReadinessState;
      contracts: string[];
      detail: string;
    };
  };
  notes: string[];
}

export function buildSystemReadinessOverview(input: {
  generatedAt: Date;
  marketData: { available: boolean; detail: string };
  database: { available: boolean; detail: string };
  aiProviders: Array<{ id: string; configured: boolean; enabled: boolean }>;
  paperTradingOnly: boolean;
  apiAuthenticationConfigured: boolean;
  governanceContracts: string[];
}): SystemReadinessOverview {
  const configuredProviders = input.aiProviders
    .filter((provider) => provider.configured && provider.enabled)
    .map((provider) => provider.id);

  const marketState: ReadinessState = input.marketData.available ? "ready" : "degraded";
  const databaseState: ReadinessState = input.database.available ? "ready" : "degraded";
  const aiState: ReadinessState = configuredProviders.length > 0 ? "ready" : "degraded";
  const executionState: "ready" | "blocked" =
    input.paperTradingOnly ? "ready" : "blocked";
  const authenticationState: "ready" | "blocked" =
    input.apiAuthenticationConfigured ? "ready" : "blocked";
  const governanceState: ReadinessState =
    input.governanceContracts.length >= 2 ? "ready" : "degraded";

  const criticalChecksReady =
    marketState === "ready" &&
    databaseState === "ready" &&
    executionState === "ready" &&
    authenticationState === "ready";

  const state: ReadinessState = executionState === "blocked"
    ? "blocked"
    : criticalChecksReady
      ? "ready"
      : "degraded";

  return {
    version: SYSTEM_READINESS_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    state,
    checks: {
      api: { state: "ready", detail: "API process is serving the readiness contract" },
      authentication: {
        state: authenticationState,
        configured: input.apiAuthenticationConfigured,
        detail: input.apiAuthenticationConfigured
          ? "Protected API endpoints require a configured token"
          : "Protected API endpoints are blocked because API_AUTH_TOKEN is not configured",
      },
      marketData: {
        state: marketState,
        detail: input.marketData.detail,
      },
      database: {
        state: databaseState,
        detail: input.database.detail,
      },
      aiProviders: {
        state: aiState,
        configured: configuredProviders,
        detail: configuredProviders.length
          ? "At least one configured AI provider is enabled"
          : "No external AI provider configured; deterministic mode remains available",
      },
      execution: {
        state: executionState,
        paperTradingOnly: input.paperTradingOnly,
        detail: input.paperTradingOnly
          ? "Real order execution is disabled"
          : "Paper-only execution invariant is not satisfied",
      },
      governance: {
        state: governanceState,
        contracts: input.governanceContracts,
        detail: governanceState === "ready"
          ? "Core governance contracts are present"
          : "One or more expected governance contracts are missing",
      },
    },
    notes: [
      "This contract is operational/readiness-only.",
      "It does not produce a trading signal.",
      "It does not alter strategy thresholds, sizing, portfolio configuration or order execution.",
    ],
  };
}
