const API_KEY_STORAGE_KEY = "ai-financial-analyst.api-key";

export class ApiFetchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
  }
}

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(value: string): void {
  if (typeof window === "undefined") return;
  const normalized = value.trim();
  try {
    if (normalized) {
      window.sessionStorage.setItem(API_KEY_STORAGE_KEY, normalized);
    } else {
      window.sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Session storage may be unavailable; keep the key in the caller's in-memory state.
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const apiKey = getApiKey();
  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    throw new ApiFetchError(401, "Autenticação da API necessária. Informe uma chave API válida.");
  }

  if (response.status === 503) {
    throw new ApiFetchError(503, "API indisponível no momento ou não configurada para esta implantação.");
  }

  return response;
}
