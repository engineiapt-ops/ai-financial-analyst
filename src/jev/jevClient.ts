import type { MarketState } from "../types.js";
import { getVercelOidcToken } from "@vercel/oidc";

const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/typesafe";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 750;
const STATIC_API_KEY = process.env.AI_GATEWAY_API_KEY ?? "";
const JEV_MODEL = "typesafe-ai/jev";

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
  modelVersion?: string;
}

export interface JevClientOptions {
  baseUrl?: string;
  credential?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  timeoutMs?: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function extractJevModelVersion(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  for (const key of ["modelVersion", "model_version", "model", "version"]) {
    const direct = stringField(payload, key);
    if (direct) return direct;
  }

  for (const key of ["metadata", "gateway", "model"]) {
    const nested = payload[key];
    if (isRecord(nested)) {
      for (const versionKey of ["modelVersion", "model_version", "model", "version"]) {
        const value = stringField(nested, versionKey);
        if (value) return value;
      }
    }
  }

  const answers = payload.answers;
  if (isRecord(answers)) {
    for (const key of ["modelVersion", "model_version", "model", "version"]) {
      const value = stringField(answers, key);
      if (value) return value;
    }
  }

  return undefined;
}

function validateJevResponse(value: unknown): JevResponse {
  if (!isRecord(value) || !isRecord(value.direcao) || !isRecord(value.risco_elevado) || !isRecord(value.qualidade)) {
    throw new Error("Jev retornou campos obrigatórios ausentes.");
  }

  const direcao = value.direcao;
  const risco = value.risco_elevado;
  const qualidade = value.qualidade;

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

  return value as unknown as JevResponse;
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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportUnreportedModelVersion(expected: string | undefined): void {
  console.warn(
    JSON.stringify({
      event: "jev_model_version_unreported",
      model: JEV_MODEL,
      expectedModelVersion: expected ?? null,
      reportedModelVersion: "unreported",
    }),
  );
}

function validateExpectedModelVersion(
  expected: string | undefined,
  reported: string | undefined,
): string {
  if (!reported) {
    reportUnreportedModelVersion(expected);
    return "unreported";
  }

  if (expected && reported !== expected) {
    throw new Error(
      `Jev model version mismatch: expected "${expected}", gateway returned "${reported}".`,
    );
  }

  return reported;
}

export async function callJev(
  market: MarketState,
  options: JevClientOptions = {},
): Promise<JevResponse> {
  const credential = options.credential ?? (await getGatewayCredential());
  if (!credential) {
    throw new Error("AI_GATEWAY_API_KEY não configurada.");
  }

  const baseUrl = (
    options.baseUrl ??
    process.env.JEV_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const expectedModelVersion = process.env.JEV_MODEL_VERSION?.trim() || undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(`${baseUrl}/v1/systemone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({
          model: JEV_MODEL,
          state: buildState(market),
          questions: {
            direcao: {
              type: "choice",
              instructions: "Qual direção de trade segue o cenário? ALTA, BAIXA, AGUARDAR.",
              criteria: {
                ALTA: "Cenário favorece compra",
                BAIXA: "Cenário favorece venda",
                AGUARDAR: "Cenário incerto",
              },
            },
            risco_elevado: {
              type: "noul",
              instructions: "O mercado apresenta risco elevado?",
              criteria: {
                true: "Risco de reversão/volatilidade alta",
                false: "Risco contínuo ou baixo",
              },
            },
            qualidade: {
              type: "score",
              instructions: "Qual a qualidade dessa oportunidade?",
              criteria: ["Baixa", "Moderada", "Alta"],
            },
          },
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new Error("Jev retornou JSON inválido.");
        }

        const reportedModelVersion =
          extractJevModelVersion(data) ??
          (isRecord(data) ? extractJevModelVersion(data.answers) : undefined);
        const modelVersion = validateExpectedModelVersion(
          expectedModelVersion,
          reportedModelVersion,
        );
        const answerPayload =
          isRecord(data) && "answers" in data ? data.answers : data;

        return {
          ...validateJevResponse(answerPayload),
          modelVersion,
        };
      }

      const body = await res.text().catch(() => "");
      if (attempt < MAX_RETRIES && isRetryableStatus(res.status)) {
        await sleepImpl(retryDelayMs(attempt, res.headers.get("retry-after")));
        continue;
      }

      throw new Error(
        `Jev API error: ${res.status} ${res.statusText}${
          body ? ` — ${body.slice(0, 500)}` : ""
        }`,
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
