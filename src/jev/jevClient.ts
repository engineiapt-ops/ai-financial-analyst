import type { MarketState } from "../types.js";
import { getVercelOidcToken } from "@vercel/oidc";

const BASE_URL = (process.env.JEV_BASE_URL ?? "https://ai-gateway.vercel.sh/typesafe").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 12_000;
const STATIC_API_KEY = process.env.AI_GATEWAY_API_KEY ?? "";

async function getGatewayCredential(): Promise<string> {
  if (STATIC_API_KEY) return STATIC_API_KEY;
  if (process.env.VERCEL) return getVercelOidcToken();
  return process.env.VERCEL_OIDC_TOKEN ?? "";
}
const JEV_MODEL = "typesafe-ai/jev";

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
}

export function buildState(market: MarketState): Record<string, unknown> {
  return {
    ativo: market.ativo, timestamp: market.timestamp, preco_atual: market.precoAtual,
    EMA9: market.indicators.ema9, EMA21: market.indicators.ema21,
    RSI: market.indicators.rsi, VWAP: market.indicators.vwap, ATR: market.indicators.atr,
    noticia_sentimento: market.noticiaSentimento, macro_dolar: market.macroDolar,
    indicador_macro: market.indicadorMacro
  };
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

export async function callJev(market: MarketState): Promise<JevResponse> {
  const credential = await getGatewayCredential();
  if (!credential) {
    throw new Error("AI_GATEWAY_API_KEY não configurada.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
    body: JSON.stringify({
      model: JEV_MODEL, state: buildState(market),
      questions: {
        direcao: {
          type: "choice",
          instructions: "Qual direção de trade segue o cenário? ALTA, BAIXA, AGUARDAR.",
          criteria: { ALTA: "Cenário favorece compra", BAIXA: "Cenário favorece venda", AGUARDAR: "Cenário incerto" }
        },
        risco_elevado: {
          type: "noul", instructions: "O mercado apresenta risco elevado?",
          criteria: { true: "Risco de reversão/volatilidade alta", false: "Risco contínuo ou baixo" }
        },
        qualidade: { type: "score", instructions: "Qual a qualidade dessa oportunidade?", criteria: ["Baixa", "Moderada", "Alta"] }
      }
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jev API error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`);
  }
  const data = await res.json();
  return validateJevResponse(data.answers ?? data);
  } finally {
    clearTimeout(timeout);
  }
}
