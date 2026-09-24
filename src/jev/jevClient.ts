import { JEV_MODEL_VERSION } from "../config/thresholds.js";
import type { MarketState } from "../types.js";

const BASE_URL = (process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 12_000;
const API_KEY = process.env.TYPESAFE_API_KEY ?? "";

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

export async function callJev(market: MarketState): Promise<JevResponse> {
  if (!JEV_MODEL_VERSION || JEV_MODEL_VERSION.includes("latest")) throw new Error("JEV_MODEL_VERSION deve estar definido e não pode ser latest.");
  if (!API_KEY) throw new Error("TYPESAFE_API_KEY não configurada.");
  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: JEV_MODEL_VERSION, state: buildState(market),
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
  if (!res.ok) throw new Error(`Jev API error: ${res.status} ${res.statusText}`);
  return await res.json() as JevResponse;
}
