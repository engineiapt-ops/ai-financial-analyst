import type { Kline, Timeframe } from "../../types.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";

export interface SaxoQuote {
  assetType: string;
  uic: number;
  bid: number;
  ask: number;
  mid: number;
  lastUpdated: string;
  marketState?: string;
  delayedByMinutes?: number;
}

interface SaxoProviderConfig {
  accessToken?: string;
  baseUrl?: string;
  minRequestIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

const HORIZON_BY_TIMEFRAME: Record<Timeframe, number> = {
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error("Missing Saxo configuration: " + name);
  return value;
}

function asPositiveNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Invalid Saxo " + field);
  return number;
}

function asNonNegativeNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Invalid Saxo " + field);
  return number;
}

function parseInstrument(value: string): { assetType: string; uic: number } {
  const match = /^([A-Za-z][A-Za-z0-9]*):(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error("Saxo instrument must use the format AssetType:UIC, e.g. FxSpot:21");
  }

  const uic = Number(match[2]);
  if (!Number.isSafeInteger(uic) || uic <= 0) throw new Error("Invalid Saxo UIC");
  return { assetType: match[1], uic };
}

function asTime(value: unknown): Date {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid Saxo candle timestamp");
  return date;
}

function readSaxoError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as { ErrorCode?: unknown; Message?: unknown; errorCode?: unknown; message?: unknown };
  return String(body.ErrorCode ?? body.errorCode ?? body.Message ?? body.message ?? "").trim();
}

export class SaxoPriceProvider implements PriceProvider {
  readonly id = "saxo-sim";
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly minRequestIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextRequestAt = 0;

  constructor(config: SaxoProviderConfig = {}) {
    this.accessToken = requireEnv("SAXO_ACCESS_TOKEN", config.accessToken ?? process.env.SAXO_ACCESS_TOKEN);
    this.baseUrl = (
      config.baseUrl ??
      process.env.SAXO_API_BASE_URL ??
      "https://gateway.saxobank.com/sim/openapi"
    ).replace(/\/$/, "");
    this.minRequestIntervalMs = Math.max(
      0,
      config.minRequestIntervalMs ?? Number(process.env.SAXO_MIN_REQUEST_INTERVAL_MS ?? 1000),
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAt - now);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
  }

  private async request(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
    await this.waitForRateLimit();

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", "Bearer " + this.accessToken);

    const response = await this.fetchImpl(this.baseUrl + path, { ...options, headers });

    if (response.status === 401 && retry) {
      return this.request(path, options, false);
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = readSaxoError(await response.clone().json());
      } catch {
        // Keep the HTTP status when the body is not JSON.
      }
      throw new Error(
        "Saxo API request failed: HTTP " + response.status + (detail ? " - " + detail : ""),
      );
    }

    return response;
  }

  async getQuote(instrument: string): Promise<SaxoQuote> {
    const { assetType, uic } = parseInstrument(instrument);
    const params = new URLSearchParams({
      AssetType: assetType,
      Uic: String(uic),
      FieldGroups: "Quote",
    });

    const response = await this.request("/trade/v1/infoprices?" + params.toString());
    const payload = await response.json() as {
      AssetType?: unknown;
      Uic?: unknown;
      LastUpdated?: unknown;
      Quote?: {
        Bid?: unknown;
        Ask?: unknown;
        Mid?: unknown;
        MarketState?: unknown;
        DelayedByMinutes?: unknown;
        ErrorCode?: unknown;
      };
    };

    const quote = payload.Quote;
    if (!quote) throw new Error("Saxo info price response missing Quote");
    const quoteError = String(quote.ErrorCode ?? "").trim();
    if (quoteError && quoteError.toLowerCase() !== "none") {
      throw new Error("Saxo info price error: " + quoteError);
    }

    return {
      assetType,
      uic,
      bid: asPositiveNumber(quote.Bid, "bid"),
      ask: asPositiveNumber(quote.Ask, "ask"),
      mid: asPositiveNumber(quote.Mid, "mid"),
      lastUpdated: String(payload.LastUpdated ?? ""),
      marketState: quote.MarketState ? String(quote.MarketState) : undefined,
      delayedByMinutes: quote.DelayedByMinutes === undefined
        ? undefined
        : asNonNegativeNumber(quote.DelayedByMinutes, "delay"),
    };
  }

  async getCandles(query: PriceQuery): Promise<Kline[]> {
    const { assetType, uic } = parseInstrument(query.instrument);
    const horizon = HORIZON_BY_TIMEFRAME[query.timeframe];
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 1200);

    const params = new URLSearchParams({
      AssetType: assetType,
      Uic: String(uic),
      Horizon: String(horizon),
      Count: String(limit),
      Mode: "UpTo",
      Time: new Date(query.endTime ?? Date.now()).toISOString(),
    });

    if (query.startTime !== undefined && query.endTime !== undefined) {
      const requestedDurationMs = Math.max(0, query.endTime - query.startTime);
      const samples = Math.ceil(requestedDurationMs / (horizon * 60_000));
      params.set("Count", String(Math.min(Math.max(samples, 1), 1200)));
    }

    const response = await this.request("/chart/v3/charts?" + params.toString());
    const payload = await response.json() as {
      Data?: Array<{
        Time?: unknown;
        Open?: unknown;
        High?: unknown;
        Low?: unknown;
        Close?: unknown;
        OpenBid?: unknown;
        HighBid?: unknown;
        LowBid?: unknown;
        CloseBid?: unknown;
        Volume?: unknown;
      }>;
    };

    if (!Array.isArray(payload.Data)) throw new Error("Saxo chart response missing Data");

    return payload.Data.map((candle) => {
      const open = candle.OpenBid ?? candle.Open;
      const high = candle.HighBid ?? candle.High;
      const low = candle.LowBid ?? candle.Low;
      const close = candle.CloseBid ?? candle.Close;

      return {
        openTime: asTime(candle.Time),
        open: asPositiveNumber(open, "open"),
        high: asPositiveNumber(high, "high"),
        low: asPositiveNumber(low, "low"),
        close: asPositiveNumber(close, "close"),
        volume: asNonNegativeNumber(candle.Volume ?? 0, "volume"),
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

export { parseInstrument };
