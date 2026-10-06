export type SaxoFetch = typeof fetch;

export interface SaxoInstrumentRegistryConfig {
  accessToken?: string;
  baseUrl?: string;
  accountKey?: string;
  minRequestIntervalMs?: number;
  fetchImpl?: SaxoFetch;
}

export interface SaxoInstrumentSummary {
  AssetType?: unknown;
  Description?: unknown;
  Identifier?: unknown;
  Symbol?: unknown;
  CurrencyCode?: unknown;
  ExchangeId?: unknown;
  TradableAs?: unknown;
}

export interface SaxoInstrumentDetails {
  AssetType?: unknown;
  Uic?: unknown;
  Symbol?: unknown;
  Description?: unknown;
  CurrencyCode?: unknown;
  ExchangeId?: unknown;
  IsTradable?: unknown;
}

export interface ResolvedSaxoInstrument {
  canonicalSymbol: string;
  provider: "saxo-sim";
  providerInstrument: string;
  status: "verified";
  symbol: string;
  description: string;
  assetType: string;
  uic: number;
  currencyCode: string | null;
  exchangeId: string | null;
  isTradable: true;
  source: "Saxo OpenAPI Reference Data (account-scoped verification)";
}

function requireAccessToken(value: string | undefined): string {
  const token = value?.trim();
  if (!token) throw new Error("Missing Saxo configuration: SAXO_ACCESS_TOKEN");
  return token;
}

function normalizeSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!symbol) throw new Error("Canonical instrument symbol is required");
  return symbol;
}

function asSafePositiveInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("Invalid Saxo " + field);
  }
  return number;
}

function asNonEmptyString(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("Invalid Saxo " + field);
  return text;
}

function asOptionalString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export class SaxoInstrumentRegistry {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly accountKey: string | undefined;
  private readonly minRequestIntervalMs: number;
  private readonly fetchImpl: SaxoFetch;
  private nextRequestAt = 0;

  constructor(config: SaxoInstrumentRegistryConfig = {}) {
    this.accessToken = requireAccessToken(config.accessToken ?? process.env.SAXO_ACCESS_TOKEN);
    this.baseUrl = (
      config.baseUrl ??
      process.env.SAXO_API_BASE_URL ??
      "https://gateway.saxobank.com/sim/openapi"
    ).replace(/\/$/, "");
    this.accountKey = config.accountKey?.trim() || undefined;
    this.minRequestIntervalMs = Math.max(
      0,
      config.minRequestIntervalMs ??
        Number(process.env.SAXO_MIN_REQUEST_INTERVAL_MS ?? 1000),
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = Math.max(0, this.nextRequestAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
  }

  private async request(path: string): Promise<Response> {
    await this.waitForRateLimit();

    const headers = new Headers({
      Accept: "application/json",
      Authorization: "Bearer " + this.accessToken,
    });

    const response = await this.fetchImpl(this.baseUrl + path, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        "Saxo instrument registry request failed: HTTP " + response.status,
      );
    }

    return response;
  }

  async resolve(
    canonicalSymbol: string,
    expectedAssetType = "FxSpot",
  ): Promise<ResolvedSaxoInstrument> {
    const symbol = normalizeSymbol(canonicalSymbol);
    const params = new URLSearchParams({
      Keywords: symbol,
      AssetTypes: expectedAssetType,
      "$top": "50",
    });

    if (this.accountKey) params.set("AccountKey", this.accountKey);

    const searchResponse = await this.request(
      "/ref/v1/instruments?" + params.toString(),
    );
    const searchPayload = (await searchResponse.json()) as {
      Data?: SaxoInstrumentSummary[];
    };

    if (!Array.isArray(searchPayload.Data)) {
      throw new Error("Saxo instrument registry response missing Data");
    }

    const candidates = searchPayload.Data.filter((item) => {
      return (
        String(item.Symbol ?? "").trim().toUpperCase() === symbol &&
        String(item.AssetType ?? "").trim().toLowerCase() ===
          expectedAssetType.toLowerCase()
      );
    });

    if (candidates.length !== 1) {
      throw new Error(
        candidates.length === 0
          ? `No exact Saxo instrument match for ${symbol}/${expectedAssetType}`
          : `Ambiguous Saxo instrument match for ${symbol}/${expectedAssetType}`,
      );
    }

    const summary = candidates[0];
    const uic = asSafePositiveInteger(summary.Identifier, "instrument UIC");
    const assetType = asNonEmptyString(summary.AssetType, "asset type");

    const detailParams = new URLSearchParams();
    if (this.accountKey) detailParams.set("AccountKey", this.accountKey);

    const detailSuffix = detailParams.toString() ? "?" + detailParams.toString() : "";
    const detailResponse = await this.request(
      "/ref/v1/instruments/details/" +
        uic +
        "/" +
        encodeURIComponent(assetType) +
        detailSuffix,
    );
    const detailPayload = (await detailResponse.json()) as {
      Data?: SaxoInstrumentDetails[];
    };

    if (!Array.isArray(detailPayload.Data) || detailPayload.Data.length !== 1) {
      throw new Error("Saxo instrument details response is invalid");
    }

    const details = detailPayload.Data[0];
    const detailUic = asSafePositiveInteger(
      details.Uic,
      "instrument detail UIC",
    );
    const detailAssetType = asNonEmptyString(
      details.AssetType,
      "instrument detail asset type",
    );
    const detailSymbol = asNonEmptyString(
      details.Symbol,
      "instrument detail symbol",
    );

    if (
      detailUic !== uic ||
      detailAssetType.toLowerCase() !== assetType.toLowerCase() ||
      detailSymbol.toUpperCase() !== symbol
    ) {
      throw new Error(
        "Saxo instrument details do not match the requested instrument",
      );
    }

    if (details.IsTradable !== true) {
      throw new Error(
        `Saxo instrument ${symbol}/${assetType} is not tradable`,
      );
    }

    return {
      canonicalSymbol: symbol,
      provider: "saxo-sim",
      providerInstrument: assetType + ":" + uic,
      status: "verified",
      symbol: detailSymbol,
      description: asNonEmptyString(
        details.Description ?? summary.Description,
        "instrument description",
      ),
      assetType: detailAssetType,
      uic: detailUic,
      currencyCode: asOptionalString(
        details.CurrencyCode ?? summary.CurrencyCode,
      ),
      exchangeId: asOptionalString(details.ExchangeId ?? summary.ExchangeId),
      isTradable: true,
      source: "Saxo OpenAPI Reference Data (account-scoped verification)",
    };
  }
}

export async function resolveSaxoInstrument(
  canonicalSymbol: string,
  config: SaxoInstrumentRegistryConfig = {},
): Promise<ResolvedSaxoInstrument> {
  return new SaxoInstrumentRegistry(config).resolve(canonicalSymbol);
}
