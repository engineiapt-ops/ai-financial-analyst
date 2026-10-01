import type { MarketState } from "../types.js";
import { getVercelOidcToken } from "@vercel/oidc";

const BASE_URL = (process.env.JEV_BASE_URL ?? "https://ai-gateway.vercel.sh/typesafe").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 750;
const STATIC_API_KEY = process.env.AI_GATEWAY_API_KEY ?? "";
const JEV_MODEL = "typesafe-ai/jev";

export interface JevClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

async function getGatewayCredential(): Promise<string> {
  if (STATIC_API_KEY) return STATIC_API_KEY;
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  if (process.env.VERCEL) return (await getVercelOidcToken()) ?? "";
  return "";
}

export interface JevAnswer<T> {
  choice?: T;
  noul?: number;
  score?: number;
  probabilities: Record<string, number> | number[];
  confidence: number;
}

export interface JevResponse {
  direcao: JevAnswer<"ALTA" | "BAIXA" | "AGUARDAR">;
  risco_elevado: JevAnswer<never>;
  qualidade: JevAnswer<never>;
  modelVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function extractModelVersion(value: unknown): string | undefined {
  const direct = readStringField(value, [
    "modelVersion",
    "model_version",
    "version",
    "model",
  ]);
  if (direct) return direct;

  if (!isRecord(value)) return undefined;

  for (const key of ["metadata", "meta", "modelInfo", "model_info", "result", "response"]) {
    const nested = extractModelVersion(value[key]);
    if (nested) return nested;
  }

  return undefined;
}

function structuredModelWarning(message: string, details: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    event: "jev_model_version_unreported",
    message,
    ...details,
  }));
}

function validateJevResponse(value: unknown): JevResponse["direcao"] extends never ? never : Omit<JevResponse, "modelVersion"> {
  if (!isRecord(value) || !value.direcao || !value.risco_elevado || !value.qualidade) {
    throw new Error("Jev retornou campos obrigatórios ausentes.");
  }

  const direcao = value.direcao as Record<string, unknown>;
  const risco = value.risco_elevado as Record<string, unknown>;
  const qualidade = value.qualidade as Record<string, unknown>;

  if (!Number.isFinite(Number(direcao.confidence))) {
    throw new Error("Jev retornou confidence inválido.");
  }
  if (!["ALTA", "BAIXA", "AGUARDAR"].includes(String(direcao.choice))) {
    throw new Error("Jev retornou choice de direção inválida.");
  }
  if (!Number.isFinite(Number(risco.noul))) {
    throw new Error("Jev retornou risco_elevado inválido.");
  }
  if (!Number.isFinite(Number(qualidade.score))) {
    throw new Error("Jev retornou qualidade inválida.");
  }

  return value as Omit<JevResponse, "modelVersion">;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 8_000);
  }
  return Math.min(RETRY_BASE_MS * 2 ** attempt, 8_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callJev(
  market: MarketState,
  options: JevClientOptions = {},
): Promise<JevResponse> {
  const credential = await getGatewayCredential();
  if (!credential) {
    throw new Error("AI_GATEWAY_API_KEY não configurada.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? sleep;
  const expectedModelVersion = process.env.JEV_MODEL_VERSION?.trim();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${BASE_URL}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
        body: JSON.stringify({
          model: JEV_MODEL,
          state: buildState(market),
          questions: {
            direcao: {
              type: "choice",
              instructions: "Qual direção de trade segue o cenário? ALTA, BAIXA, AGUARDAR.",
              criteria: { ALTA: "Cenário favorece compra", BAIXA: "Cenário favorece venda", AGUARDAR: "Cenário incerto" }
            },
            risco_elevado: {
              type: "noul",
              instructions: "O mercado apresenta risco elevado?",
              criteria: { true: "Risco de reversão/volatilidade alta", false: "Risco contínuo ou baixo" }
            },
            qualidade: {
              type: "score",
              instructions: "Qual a qualidade dessa oportunidade?",
              criteria: ["Baixa", "Moderada", "Alta"]
            }
          }
        })
      });

      if (res.ok) {
        let payload: unknown;
        try {
          payload = await res.json();
        } catch {
          throw new Error("Jev retornou uma resposta JSON inválida.");
        }

        const answers = validateJevResponse(
          isRecord(payload) && "answers" in payload ? payload.answers : payload,
        );
        const modelVersion =
          extractModelVersion(payload) ??
          (isRecord(answers) ? extractModelVersion(answers) : undefined) ??
          "unreported";

        if (modelVersion === "unreported") {
          structuredModelWarning("Gateway did not report a model/version identifier", {
            gatewayUrl: BASE_URL,
            expectedVersion: expectedModelVersion ?? null,
          });
        } else if (expectedModelVersion && modelVersion !== expectedModelVersion) {
          throw new Error(
            `JEV model/version mismatch: expected "${expectedModelVersion}", gateway returned "${modelVersion}".`,
          );
        }

        return {
          ...(answers as Omit<JevResponse, "modelVersion">),
          modelVersion,
        };
      }

      const body = await res.text().catch(() => "");
      if (attempt < MAX_RETRIES && isRetryableStatus(res.status)) {
        await sleepImpl(retryDelayMs(attempt, res.headers.get("retry-after")));
        continue;
      }

      throw new Error(
        `Jev API error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Jev request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Jev request retries exhausted");
}

export function buildState(market: MarketState): Record<string, unknown> {
  return {
    ativo: market.ativo,
    timestamp: market.timestamp,
    data_as_of: market.dataAsOf,
    preco_atual: market.precoAtual,
    EMA9: market.indicators.ema9,
    EMA21: market.indicators.ema21,
    RSI: market.indicators.rsi,
    VWAP: market.indicators.vwap,
    ATR: market.indicators.atr,
    noticia_sentimento: market.noticiaSentimento,
    macro_dolar: market.macroDolar,
    indicador_macro: market.indicadorMacro,
  };
}
