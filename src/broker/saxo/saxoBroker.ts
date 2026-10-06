import type {
  BrokerAccountSummary,
  BrokerEnvironment,
  BrokerReadClient,
} from "../broker.js";
import { resolveSaxoEnvironment } from "./saxoConfig.js";

interface SaxoBrokerClientConfig {
  environment?: BrokerEnvironment;
  enableLiveReadOnly?: boolean;
  accessToken?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  minRequestIntervalMs?: number;
}

function requireToken(value: string | undefined): string {
  const token = value?.trim();
  if (!token) throw new Error("Missing Saxo configuration: SAXO_ACCESS_TOKEN");
  return token;
}

function requireString(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error("Saxo response missing " + field);
  return normalized;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid Saxo " + field);
  return value;
}

interface SaxoAccountsResponse {
  Data?: Array<{
    AccountKey?: unknown;
    AccountId?: unknown;
    Currency?: unknown;
    AccountType?: unknown;
    Active?: unknown;
  }>;
}

export class SaxoBrokerClient implements BrokerReadClient {
  readonly id = "saxo";
  readonly environment: BrokerEnvironment;
  readonly executionEnabled = false as const;

  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minRequestIntervalMs: number;
  private nextRequestAt = 0;

  constructor(config: SaxoBrokerClientConfig = {}) {
    const environment = resolveSaxoEnvironment({
      environment: config.environment,
      enableLiveReadOnly: config.enableLiveReadOnly,
    });
    this.environment = environment.environment;
    this.accessToken = requireToken(config.accessToken ?? process.env.SAXO_ACCESS_TOKEN);
    this.baseUrl = (config.apiBaseUrl ?? environment.apiBaseUrl).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.minRequestIntervalMs = Math.max(
      0,
      config.minRequestIntervalMs ??
        Number(process.env.SAXO_MIN_REQUEST_INTERVAL_MS ?? 1000),
    );
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAt - now);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
  }

  private async request(path: string): Promise<Response> {
    await this.waitForRateLimit();

    const headers = new Headers();
    headers.set("Accept", "application/json");
    headers.set("Authorization", "Bearer " + this.accessToken);

    const response = await this.fetchImpl(this.baseUrl + path, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        "Saxo broker request failed: HTTP " + response.status,
      );
    }

    return response;
  }

  async getAccounts(): Promise<BrokerAccountSummary[]> {
    const response = await this.request("/port/v1/accounts/me?$top=100");
    const payload = (await response.json()) as SaxoAccountsResponse;

    if (!Array.isArray(payload.Data)) {
      throw new Error("Saxo accounts response missing Data");
    }

    return payload.Data.map((account) => ({
      accountKey: requireString(account.AccountKey, "AccountKey"),
      accountId: requireString(account.AccountId, "AccountId"),
      currency: requireString(account.Currency, "Currency"),
      accountType: requireString(account.AccountType, "AccountType"),
      active: readBoolean(account.Active, "Active"),
    }));
  }

  async getAccount(accountKey: string): Promise<BrokerAccountSummary> {
    const key = accountKey.trim();
    if (!key) throw new Error("Saxo account key is required");

    const response = await this.request(
      "/port/v1/accounts/" + encodeURIComponent(key),
    );
    const account = (await response.json()) as {
      AccountKey?: unknown;
      AccountId?: unknown;
      Currency?: unknown;
      AccountType?: unknown;
      Active?: unknown;
    };

    return {
      accountKey: requireString(account.AccountKey, "AccountKey"),
      accountId: requireString(account.AccountId, "AccountId"),
      currency: requireString(account.Currency, "Currency"),
      accountType: requireString(account.AccountType, "AccountType"),
      active: readBoolean(account.Active, "Active"),
    };
  }
}
