import { randomBytes } from "node:crypto";
import { resolveSaxoEnvironment } from "./saxoConfig.js";

export interface SaxoOAuthConfig {
  environment?: "sim" | "live";
  enableLiveReadOnly?: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  authenticationBaseUrl?: string;
  minRequestIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SaxoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  refresh_token_expires_in?: number;
}

function requireConfig(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error("Missing Saxo OAuth configuration: " + name);
  return normalized;
}

function asFinitePositiveNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error("Invalid Saxo OAuth " + field);
  }
  return number;
}

export class SaxoOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authenticationBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minRequestIntervalMs: number;
  private nextRequestAt = 0;

  constructor(config: SaxoOAuthConfig = {}) {
    const environment = resolveSaxoEnvironment({
      environment: config.environment,
      enableLiveReadOnly: config.enableLiveReadOnly,
    });

    this.clientId = requireConfig(
      "SAXO_CLIENT_ID",
      config.clientId ?? process.env.SAXO_CLIENT_ID,
    );
    this.clientSecret = requireConfig(
      "SAXO_CLIENT_SECRET",
      config.clientSecret ?? process.env.SAXO_CLIENT_SECRET,
    );
    this.redirectUri = requireConfig(
      "SAXO_REDIRECT_URI",
      config.redirectUri ?? process.env.SAXO_REDIRECT_URI,
    );
    this.authenticationBaseUrl = (
      config.authenticationBaseUrl ??
      process.env.SAXO_AUTH_BASE_URL ??
      environment.authenticationBaseUrl
    ).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.minRequestIntervalMs = Math.max(
      0,
      config.minRequestIntervalMs ??
        Number(process.env.SAXO_MIN_REQUEST_INTERVAL_MS ?? 1000),
    );
  }

  createAuthorizationUrl(
    state = randomBytes(24).toString("hex"),
  ): { url: string; state: string } {
    const url = new URL("/authorize", this.authenticationBaseUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", this.redirectUri);
    return { url: url.toString(), state };
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = Math.max(0, this.nextRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
  }

  private async requestToken(
    body: URLSearchParams,
  ): Promise<SaxoTokenResponse> {
    await this.waitForRateLimit();

    const credentials = Buffer.from(
      this.clientId + ":" + this.clientSecret,
      "utf8",
    ).toString("base64");

    const response = await this.fetchImpl(
      this.authenticationBaseUrl + "/token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + credentials,
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as {
          error?: unknown;
          error_description?: unknown;
        };
        detail = String(
          payload.error_description ?? payload.error ?? "",
        ).trim();
      } catch {
        // Preserve HTTP status when the provider does not return JSON.
      }
      throw new Error(
        "Saxo OAuth token request failed: HTTP " +
          response.status +
          (detail ? " - " + detail : ""),
      );
    }

    const payload = (await response.json()) as Partial<SaxoTokenResponse>;
    if (!payload.access_token) {
      throw new Error("Saxo OAuth token response is missing access_token");
    }

    const token: SaxoTokenResponse = {
      access_token: String(payload.access_token),
      refresh_token: payload.refresh_token
        ? String(payload.refresh_token)
        : undefined,
      expires_in: asFinitePositiveNumber(payload.expires_in, "expires_in"),
      token_type: String(payload.token_type ?? "Bearer"),
    };

    if (payload.refresh_token_expires_in !== undefined) {
      token.refresh_token_expires_in = asFinitePositiveNumber(
        payload.refresh_token_expires_in,
        "refresh_token_expires_in",
      );
    }

    return token;
  }

  async exchangeCode(code: string): Promise<SaxoTokenResponse> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new Error("Saxo authorization code is required");
    }

    return this.requestToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: normalizedCode,
        redirect_uri: this.redirectUri,
      }),
    );
  }

  async refreshToken(refreshToken: string): Promise<SaxoTokenResponse> {
    const normalizedToken = refreshToken.trim();
    if (!normalizedToken) {
      throw new Error("Saxo refresh token is required");
    }

    return this.requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: normalizedToken,
        redirect_uri: this.redirectUri,
      }),
    );
  }
}
