let memoryApiKey: string | null = null;

const SESSION_KEY = "ai-financial-analyst.apiKey";
export const API_AUTH_ERROR_EVENT = "ai-financial-analyst:api-auth-error";

export interface ApiFetchErrorDetail {
  status: 401 | 503;
  message: string;
}

function readSessionApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function getApiKey(): string | null {
  return memoryApiKey ?? readSessionApiKey();
}

export function setApiKey(value: string): void {
  const normalized = value.trim();
  memoryApiKey = normalized || null;

  if (typeof window === "undefined") return;
  try {
    if (normalized) {
      window.sessionStorage.setItem(SESSION_KEY, normalized);
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

function emitApiAuthError(status: 401 | 503): void {
  if (typeof window === "undefined") return;

  const message =
    status === 401
      ? "Sua chave da API é inválida ou não foi aceita. Informe uma API key válida."
      : "O serviço de autenticação da API está temporariamente indisponível. Tente novamente.";

  window.dispatchEvent(
    new CustomEvent<ApiFetchErrorDetail>(API_AUTH_ERROR_EVENT, {
      detail: { status, message },
    }),
  );
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

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401 || response.status === 503) {
    emitApiAuthError(response.status);
  }

  return response;
}
