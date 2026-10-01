import type { MarketState } from "../types.js";
import { getVercelOidcToken } from "@vercel/oidc";

const BASE_URL = (process.env.JEV_BASE_URL ?? "https://ai-gateway.vercel.sh/typesafe").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 750;
const STATIC_API_KEY = process.env.AI_GATEWAY_API_KEY ?? "";

async function getGatewayCredential(): Promise<string> {
  if (STATIC_API_KEY) return STATIC_API_KEY;
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  if (process.env.VERCEL) return (await getVercelOidcToken()) ?? "";
  return "";
}
const JEV_MODEL = "typesafe-ai/jev";
const EXPECTED_JEV_MODEL_VERSION = process.env.JEV_MODEL_VERSION?.trim() ?? "";

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

export function buildState(market: MarketState): Record<string, unknown> {
  return {
    ativo: market.ativo,
    timestamp: market.timestamp,
    data_as_of: market.dataAsOf,
    preco_atual: market.precoAtual,
    EMA9: market.indicators.ema9, EMA21: market.indicators.ema21,
    RSI: market.indicators.rsi, VWAP: market.indicators.vwap, ATR: market.indicators.atr,
    noticia_sentimento: market.noticiaSentimento, macro_dolar: market.macroDolar,
    indicador_macro: market.indicadorMacro
  };
}

function extractModelVersion(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;

  for (const key of ["modelVersion", "model_version", "version", "model"]) {
    const candidate = root[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  for (const key of ["metadata", "meta"]) {
    const nested = root[key];
    if (!nested || typeof nested !== "object") continue;
    const record = nested as Record<string, unknown>;
    for (const versionKey of ["modelVersion", "model_version", "version", "model"]) {
      const candidate = record[versionKey];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }

  return undefined;
}

function validateJevResponse(value: any): JevResponse {
  if (!value?.direcao || !value?.risco_elevado || !value?.qualidade) {
    throw new Error("Jev retornou campos obrigatórios ausentes.");
  }
  if (!Number.isFinite(value.direcao.confidence)) {
    throw new Error("Jev retornou confidence inválido.");
  }
  if (!["ALTA", "BAIXA", "AGUARDAR"].includes(value.direcao.choice)) {
    throw new Error("Jev retornou choice de direção inválida.");
  }
  if (!Number.isFinite(Number(value.risco_elevado.noul))) {
    throw new Error("Jev retornou risco_elevado inválido.");
  }
  if (!Number.isFinite(Number(value.qualidade.score))) {
    throw new Error("Jev retornou qualidade inválida.");
  }
  return value as JevResponse;
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

export async function callJev(market: MarketState): Promise<JevResponse> {
  const credential = await getGatewayCredential();
  if (!credential) {
    throw new Error("AI_GATEWAY_API_KEY não configurada.");
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}/v1/systemone`, {
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
        const data: unknown = await res.json();
        const modelVersion = extractModelVersion(data);
        const effectiveModelVersion = modelVersion ?? "unreported";

        if (!modelVersion) {
          console.warn(JSON.stringify({
            event: "jev_model_version_unreported",
            configuredExpectedVersion: EXPECTED_JEV_MODEL_VERSION || null,
            providerModel: JEV_MODEL,
          }));
        }

        if (EXPECTED_JEV_MODEL_VERSION && effectiveModelVersion !== EXPECTED_JEV_MODEL_VERSION) {
          throw new Error(
            `Jev model version mismatch: expected "${EXPECTED_JEV_MODEL_VERSION}", received "${effectiveModelVersion}".`,
          );
        }

        const payload =
          data && typeof data === "object" && "answers" in data
            ? (data as Record<string, unknown>).answers
            : data;

        return {
          ...validateJevResponse(payload),
          modelVersion: effectiveModelVersion,
        };
      }

      const body = await res.text().catch(() => "");
      if (attempt < MAX_RETRIES && isRetryableStatus(res.status)) {
        await sleep(retryDelayMs(attempt, res.headers.get("retry-after")));
        continue;
      }

      throw new Error(`Jev API error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Jev request retries exhausted");
}
