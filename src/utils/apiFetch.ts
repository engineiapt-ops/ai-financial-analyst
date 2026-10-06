const API_KEY_STORAGE_KEY = "ai-financial-analyst-api-key";

type ImportMetaEnvLike = {
  VITE_API_BASE_URL?: string;
};

function readApiBaseUrl(): string {
  const value = (import.meta as ImportMeta & { env?: ImportMetaEnvLike }).env?.VITE_API_BASE_URL?.trim();
  return value ? value.replace(/\/$/, "") : "";
}

/**
 * Resolves relative frontend API paths against the optional backend origin.
 *
 * Empty VITE_API_BASE_URL preserves the previous same-origin behavior.
 */
export function resolveApiUrl(input: RequestInfo | URL, apiBaseUrl = readApiBaseUrl()): RequestInfo | URL {
  if (!apiBaseUrl || typeof input !== "string" || !input.startsWith("/")) {
    return input;
  }

  return apiBaseUrl.replace(/\/$/, "") + input;
}

let apiKeyInMemory: string | undefined;

function readSessionApiKey(): string | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const value = sessionStorage.getItem(API_KEY_STORAGE_KEY)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function getApiKey(): string | undefined {
  if (apiKeyInMemory !== undefined) return apiKeyInMemory;
  apiKeyInMemory = readSessionApiKey();
  return apiKeyInMemory;
}

export function setApiKey(value: string): void {
  const normalized = value.trim();
  apiKeyInMemory = normalized || undefined;

  if (typeof sessionStorage === "undefined") return;

  try {
    if (normalized) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, normalized);
    } else {
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Session storage may be unavailable in privacy-restricted browsers.
  }
}

export function clearApiKey(): void {
  setApiKey("");
}

export class ApiFetchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const apiKey = getApiKey();

  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }

  const response = await fetch(resolveApiUrl(input), {
    ...init,
    headers,
  });

  if (response.status === 401) {
    throw new ApiFetchError(
      401,
      "Autenticação da API recusada (401). Informe uma API key válida nesta sessão.",
    );
  }

  if (response.status === 503) {
    throw new ApiFetchError(
      503,
      "API indisponível ou autenticação não configurada (503). Verifique a configuração do servidor.",
    );
  }

  return response;
}
