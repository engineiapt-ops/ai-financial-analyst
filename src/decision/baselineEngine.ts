import { FIXED_POSITION_PCT, thresholds } from "../config/thresholds.js";
import type { DecisionResult, MarketState, Recomendacao } from "../types.js";

const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;
const MAX_ATR_RELATIVE = 0.02;

export function evaluateBaseline(market: MarketState): DecisionResult {
  const { ema9, ema21, rsi, atr } = market.indicators;

  if (
    ema9 === null ||
    ema21 === null ||
    rsi === null ||
    atr === null ||
    !Number.isFinite(market.precoAtual) ||
    market.precoAtual <= 0
  ) {
    return {
      origem: "baseline",
      recomendacao: "WAIT",
      tamanhoPosicaoPct: 0,
      riscoElevado: false,
      observacao: "Indicadores insuficientes ou preço inválido",
    };
  }

  let recomendacao: Recomendacao = "WAIT";

  if (ema9 > ema21 && rsi < RSI_OVERBOUGHT) {
    recomendacao = "BUY";
  } else if (ema9 < ema21 && rsi > RSI_OVERSOLD) {
    recomendacao = "SELL";
  }

  const atrRelativo = atr / market.precoAtual;
  const riscoElevado = atrRelativo > MAX_ATR_RELATIVE;

  if (thresholds.bloquearSeRiscoElevado && riscoElevado) {
    recomendacao = "WAIT";
  }

  return {
    origem: "baseline",
    recomendacao,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : FIXED_POSITION_PCT,
    riscoElevado,
    observacao: `ema9=${ema9.toFixed(2)} ema21=${ema21.toFixed(2)} rsi=${rsi.toFixed(1)} atrRelativo=${(atrRelativo * 100).toFixed(2)}%`,
  };
}

export const decideBaseline = evaluateBaseline;
