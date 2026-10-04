import type { Kline, Timeframe } from "../../types.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";

export interface IgQuote {
  epic: string;
  bid: number;
  ask: number;
  snapshotTime: string;
  marketStatus?: string;
}

interface IgSession {
  cst: string;
  securityToken: string;
}

interface IgProviderConfig {
  apiKey?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const RESOLUTION_BY_TIMEFRAME: Record<Timeframe, string> = {
  "1h": "HOUR",
  "4h": "HOUR_4",
  "1d": "DAY",
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing IG configuration: ${name}`);
  return value;
}

function asFiniteNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Invalid IG ${field}`);
  return number;
}

function asTime(value: unknown): Date {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid IG candle timestamp");
  return date;
}

export class IgPriceProvider implements PriceProvider {
  readonly id = "ig-demo";
  private readonly apiKey: string;
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private session: IgSession | null = null;

  constructor(config: IgProviderConfig = {}) {
    this.apiKey = requireEnv("IG_API_KEY", config.apiKey ?? process.env.IG_API_KEY);
    this.username = requireEnv("IG_USERNAME", config.username ?? process.env.IG_USERNAME);
    this.password = requireEnv("IG_PASSWORD", config.password ?? process.env.IG_PASSWORD);
    this.baseUrl = (config.baseUrl ?? process.env.IG_API_BASE_URL ?? "https://demo-api.ig.com/gateway/deal").replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async authenticate(): Promise<IgSession> {
    const response = await this.fetchImpl(`${this.baseUrl}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-IG-API-KEY": this.apiKey,
        Version: "2",
      },
      body: JSON.stringify({
        identifier: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) throw new Error(`IG authentication failed: HTTP ${response.status}`);
    const cst = response.headers.get("CST");
    const securityToken = response.headers.get("X-SECURITY-TOKEN");
    if (!cst || !securityToken) throw new Error("IG authentication failed: missing session tokens");

    this.session = { cst, securityToken };
    return this.session;
  }

  private async request(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
    const session = this.session ?? await this.authenticate();
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json; charset=UTF-8");
    headers.set("Content-Type", "application/json");
    headers.set("X-IG-API-KEY", this.apiKey);
    headers.set("CST", session.cst);
    headers.set("X-SECURITY-TOKEN", session.securityToken);
    headers.set("Version", "3");

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...options, headers });
    if (response.status === 401 && retry) {
      this.session = null;
      return this.request(path, options, false);
    }
    if (!response.ok) throw new Error(`IG API request failed: HTTP ${response.status}`);
    return response;
  }

  async getQuote(epic: string): Promise<IgQuote> {
    if (!epic.trim()) throw new Error("IG epic is required");
    const response = await this.request(`/markets/${encodeURIComponent(epic)}`);
    const payload = await response.json() as {
      snapshot?: { bid?: unknown; offer?: unknown; snapshotTime?: unknown; marketStatus?: string };
    };
    const snapshot = payload.snapshot;
    if (!snapshot) throw new Error("IG market response missing snapshot");
    return {
      epic,
      bid: asFiniteNumber(snapshot.bid, "bid"),
      ask: asFiniteNumber(snapshot.offer, "ask"),
      snapshotTime: String(snapshot.snapshotTime ?? ""),
      marketStatus: snapshot.marketStatus,
    };
  }

  async getCandles(query: PriceQuery): Promise<Kline[]> {
    const epic = query.instrument.trim();
    if (!epic) throw new Error("IG epic is required");
    const resolution = RESOLUTION_BY_TIMEFRAME[query.timeframe];
    const params = new URLSearchParams();
    params.set("resolution", resolution);
    params.set("max", String(Math.min(Math.max(query.limit ?? 500, 1), 1000)));
    if (query.startTime !== undefined || query.endTime !== undefined) {
      const from = new Date(query.startTime ?? 0).toISOString();
      const to = new Date(query.endTime ?? Date.now()).toISOString();
      params.delete("max");
      params.set("from", from);
      params.set("to", to);
    }

    const response = await this.request(`/prices/${encodeURIComponent(epic)}?${params.toString()}`);
    const payload = await response.json() as {
      prices?: Array<{
        snapshotTime?: unknown;
        snapshotTimeUTC?: unknown;
        openPrice?: { bid?: unknown; ask?: unknown };
        highPrice?: { bid?: unknown; ask?: unknown };
        lowPrice?: { bid?: unknown; ask?: unknown };
        closePrice?: { bid?: unknown; ask?: unknown };
        lastTradedVolume?: unknown;
      }>;
    };

    if (!Array.isArray(payload.prices)) throw new Error("IG prices response missing prices");
    return payload.prices.map((candle) => {
      const open = asFiniteNumber(candle.openPrice?.bid, "open");
      const high = asFiniteNumber(candle.highPrice?.bid, "high");
      const low = asFiniteNumber(candle.lowPrice?.bid, "low");
      const close = asFiniteNumber(candle.closePrice?.bid, "close");
      const volume = Number(candle.lastTradedVolume ?? 0);
      if (!Number.isFinite(volume) || volume < 0) throw new Error("Invalid IG candle volume");
      return {
        openTime: asTime(candle.snapshotTimeUTC ?? candle.snapshotTime),
        open,
        high,
        low,
        close,
        volume,
      };
    });
  }

  getMetadata(query: PriceQuery): PriceProviderMetadata {
    return {
      provider: this.id,
      instrument: query.instrument,
      timeframe: query.timeframe,
      source: "broker",
      quoteMode: "bid_ask",
    };
  }
}
