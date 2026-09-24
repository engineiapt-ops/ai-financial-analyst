import { FIXED_POSITION_PCT, thresholds } from "../config/thresholds.js";
import type { DecisionResult, MarketState, Recomendacao } from "../types.js";

export function decideBaseline(market: MarketState): DecisionResult {
  const { ema9, ema21, rsi } = market.indicators;
  let recomendacao: Recomendacao = "WAIT";
  if (ema9 > ema21 && rsi < 70) recomendacao = "BUY";
  else if (ema9 < ema21 && rsi > 30) recomendacao = "SELL";
  const atrRelativo = market.indicators.atr / market.precoAtual;
  const riscoElevado = atrRelativo > 0.02;
  if (thresholds.bloquearSeRiscoElevado && riscoElevado) recomendacao = "WAIT";
  return {
    origem: "baseline", recomendacao,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : FIXED_POSITION_PCT,
    riscoElevado,
    observacao: `ema9=${ema9.toFixed(2)} ema21=${ema21.toFixed(2)} rsi=${rsi.toFixed(1)}`
  };
}
