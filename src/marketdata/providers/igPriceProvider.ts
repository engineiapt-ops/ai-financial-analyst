import type { Kline, Timeframe } from "../../types.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";

export interface IgQuote {
  epic: string;
  bid: number;
  ask: number;
  snapshotTime: string;
  marketStatus?: string;
}

export interface IgMarketRule {
  unit: string;
  value: number;
}

export interface IgMarginDepositBand {
  currency: string;
  min: number;
  max: number;
  margin: number;
  marginFactor: number;
  marginFactorUnit: string;
}

export interface IgMarketDetails {
  epic: string;
  name: string;
  symbol: string;
  marketId: string;
  type: string;
  unit: string;
  contractSize: string;
  lotSize: number;
  expiry: string;
  currencies: string[];
  dealingRules: {
    minDealSize: IgMarketRule;
    minStepDistance: IgMarketRule;
    minNormalStopOrLimitDistance: IgMarketRule;
    minControlledRiskStopDistance: IgMarketRule;
    maxStopOrLimitDistance: IgMarketRule;
  };
  marginDepositBands: IgMarginDepositBand[];
  openingHours: Array<{ openTime: string; closeTime: string }>;
  snapshot: IgQuote;
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

function asNonNegativeNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid IG ${field}`);
  return number;
}

function asTime(value: unknown): Date {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid IG candle timestamp");
  return date;
}

function parseRule(value: unknown, field: string): IgMarketRule {
  if (!value || typeof value !== "object") throw new Error(`Missing IG ${field}`);
  const rule = value as { unit?: unknown; value?: unknown };
  const unit = String(rule.unit ?? "");
  if (!unit) throw new Error(`Invalid IG ${field} unit`);
  return { unit, value: asFiniteNumber(rule.value, field) };
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
      snapshot?: { bid?: unknown; offer?: unknown; snapshotTime?: unknown; updateTime?: unknown; marketStatus?: string };
    };
    const snapshot = payload.snapshot;
    if (!snapshot) throw new Error("IG market response missing snapshot");
    return {
      epic,
      bid: asFiniteNumber(snapshot.bid, "bid"),
      ask: asFiniteNumber(snapshot.offer, "ask"),
      snapshotTime: String(snapshot.snapshotTime ?? snapshot.updateTime ?? ""),
      marketStatus: snapshot.marketStatus,
    };
  }

  async getMarketDetails(epic: string): Promise<IgMarketDetails> {
    if (!epic.trim()) throw new Error("IG epic is required");

    const response = await this.request(`/markets/${encodeURIComponent(epic)}`);
    const payload = await response.json() as {
      instrument?: {
        epic?: unknown;
        name?: unknown;
        symbol?: unknown;
        marketId?: unknown;
        type?: unknown;
        unit?: unknown;
        contractSize?: unknown;
        lotSize?: unknown;
        expiry?: unknown;
        currencies?: Array<{ symbol?: unknown }>;
        marginDepositBands?: Array<{
          currency?: unknown;
          min?: unknown;
          max?: unknown;
          margin?: unknown;
          marginFactor?: unknown;
          marginFactorUnit?: unknown;
        }>;
        openingHours?: { marketTimes?: Array<{ openTime?: unknown; closeTime?: unknown }> };
      };
      dealingRules?: {
        minDealSize?: unknown;
        minStepDistance?: unknown;
        minNormalStopOrLimitDistance?: unknown;
        minControlledRiskStopDistance?: unknown;
        maxStopOrLimitDistance?: unknown;
      };
      snapshot?: {
        bid?: unknown;
        offer?: unknown;
        snapshotTime?: unknown;
        updateTime?: unknown;
        marketStatus?: unknown;
      };
    };

    const instrument = payload.instrument;
    if (!instrument) throw new Error("IG market response missing instrument");
    if (String(instrument.epic ?? "") !== epic) throw new Error("IG market response epic mismatch");

    const currencies = (instrument.currencies ?? [])
      .map((currency) => String(currency.symbol ?? ""))
      .filter(Boolean);

    const marketTimes = instrument.openingHours?.marketTimes ?? [];
    const openingHours = marketTimes
      .map((window) => ({
        openTime: String(window.openTime ?? ""),
        closeTime: String(window.closeTime ?? ""),
      }))
      .filter((window) => window.openTime && window.closeTime);
    if (!openingHours.length) throw new Error("IG market response missing opening hours");

    const snapshot = payload.snapshot;
    if (!snapshot) throw new Error("IG market response missing snapshot");

    const marketSnapshot: IgQuote = {
      epic,
      bid: asFiniteNumber(snapshot.bid, "bid"),
      ask: asFiniteNumber(snapshot.offer, "offer"),
      snapshotTime: String(snapshot.snapshotTime ?? snapshot.updateTime ?? ""),
      marketStatus: String(snapshot.marketStatus ?? ""),
    };

    const marginDepositBands = (instrument.marginDepositBands ?? [])
      .map((band) => ({
        currency: String(band.currency ?? ""),
        min: asNonNegativeNumber(band.min, "margin min"),
        max: asNonNegativeNumber(band.max, "margin max"),
        margin: asFiniteNumber(band.margin, "margin"),
        marginFactor: asFiniteNumber(band.marginFactor, "marginFactor"),
        marginFactorUnit: String(band.marginFactorUnit ?? ""),
      }))
      .filter((band) => band.currency && band.marginFactorUnit);

    return {
      epic,
      name: String(instrument.name ?? ""),
      symbol: String(instrument.symbol ?? ""),
      marketId: String(instrument.marketId ?? ""),
      type: String(instrument.type ?? ""),
      unit: String(instrument.unit ?? ""),
      contractSize: String(instrument.contractSize ?? ""),
      lotSize: asFiniteNumber(instrument.lotSize, "lotSize"),
      expiry: String(instrument.expiry ?? ""),
      currencies,
      dealingRules: {
        minDealSize: parseRule(payload.dealingRules?.minDealSize, "minDealSize"),
        minStepDistance: parseRule(payload.dealingRules?.minStepDistance, "minStepDistance"),
        minNormalStopOrLimitDistance: parseRule(payload.dealingRules?.minNormalStopOrLimitDistance, "minNormalStopOrLimitDistance"),
        minControlledRiskStopDistance: parseRule(payload.dealingRules?.minControlledRiskStopDistance, "minControlledRiskStopDistance"),
        maxStopOrLimitDistance: parseRule(payload.dealingRules?.maxStopOrLimitDistance, "maxStopOrLimitDistance"),
      },
      marginDepositBands,
      openingHours,
      snapshot: marketSnapshot,
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
