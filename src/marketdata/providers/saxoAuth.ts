import { randomBytes } from "node:crypto";

export interface SaxoOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  authenticationBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SaxoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

function requireConfig(name: string, value: string | undefined): string {
  if (!value) throw new Error("Missing Saxo OAuth configuration: " + name);
  return value;
}

export class SaxoOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authenticationBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SaxoOAuthConfig = {}) {
    this.clientId = requireConfig("SAXO_CLIENT_ID", config.clientId ?? process.env.SAXO_CLIENT_ID);
    this.clientSecret = requireConfig("SAXO_CLIENT_SECRET", config.clientSecret ?? process.env.SAXO_CLIENT_SECRET);
    this.redirectUri = requireConfig("SAXO_REDIRECT_URI", config.redirectUri ?? process.env.SAXO_REDIRECT_URI);
    this.authenticationBaseUrl = (
      config.authenticationBaseUrl ??
      process.env.SAXO_AUTH_BASE_URL ??
      "https://sim.logonvalidation.net"
    ).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  createAuthorizationUrl(state = randomBytes(24).toString("hex")): { url: string; state: string } {
    const url = new URL("/authorize", this.authenticationBaseUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", this.redirectUri);
    return { url: url.toString(), state };
  }

  async exchangeCode(code: string): Promise<SaxoTokenResponse> {
    if (!code.trim()) throw new Error("Saxo authorization code is required");

    const credentials = Buffer.from(this.clientId + ":" + this.clientSecret, "utf8").toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await this.fetchImpl(this.authenticationBaseUrl + "/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + credentials,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json() as { error?: unknown; error_description?: unknown };
        detail = String(payload.error_description ?? payload.error ?? "").trim();
      } catch {
        // Preserve the HTTP status when the provider does not return JSON.
      }
      throw new Error(
        "Saxo OAuth token exchange failed: HTTP " + response.status + (detail ? " - " + detail : ""),
      );
    }

    const payload = await response.json() as Partial<SaxoTokenResponse>;
    if (!payload.access_token || !Number.isFinite(Number(payload.expires_in))) {
      throw new Error("Saxo OAuth token response is invalid");
    }

    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: Number(payload.expires_in),
      token_type: String(payload.token_type ?? "Bearer"),
    };
  }
}
