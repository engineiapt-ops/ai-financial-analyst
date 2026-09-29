import { FIXED_POSITION_PCT, thresholds } from "../config/thresholds.js";
import type { DecisionResult, MarketState, Recomendacao, Timeframe } from "../types.js";

const RSI_BUY_MIN = 42;
const RSI_BUY_MAX = 62;
const RSI_SELL_MIN = 38;
const RSI_SELL_MAX = 58;

const MAX_ATR_RELATIVE: Record<Timeframe, number> = {
  "1h": 0.018,
  "4h": 0.028,
  "1d": 0.045,
};

const MIN_EMA_SPREAD_PCT = 0.0015;

function atrLimit(timeframe: Timeframe): number {
  return MAX_ATR_RELATIVE[timeframe] ?? MAX_ATR_RELATIVE["1h"];
}

function computePositionSize(recomendacao: Recomendacao, atrRelativo: number, maxAtr: number): number {
  if (recomendacao === "WAIT") return 0;
  const stress = atrRelativo / maxAtr;
  if (stress >= 0.66) return Math.round(FIXED_POSITION_PCT * 0.6 * 100) / 100;
  return FIXED_POSITION_PCT;
}

export function evaluateBaseline(market: MarketState): DecisionResult {
  const { ema9, ema21, rsi, atr, vwap } = market.indicators;
  const price = market.precoAtual;
  const tf = market.timeframe;

  if (ema9 === null || ema21 === null || rsi === null || atr === null || vwap === null || !Number.isFinite(price) || price <= 0) {
    return {
      origem: "baseline",
      recomendacao: "WAIT",
      tamanhoPosicaoPct: 0,
      riscoElevado: false,
      observacao: "Indicadores insuficientes ou preço inválido",
    };
  }

  const atrRelativo = atr / price;
  const maxAtr = atrLimit(tf);
  const riscoElevado = atrRelativo > maxAtr;
  const emaSpreadPct = Math.abs(ema9 - ema21) / price;

  let recomendacao: Recomendacao = "WAIT";
  const reasons: string[] = [];

  const trendUp = ema9 > ema21 && emaSpreadPct >= MIN_EMA_SPREAD_PCT;
  const trendDown = ema9 < ema21 && emaSpreadPct >= MIN_EMA_SPREAD_PCT;
  if (!trendUp && !trendDown) reasons.push("lateral_ou_ema_apertada");

  const aboveVwap = price >= vwap;
  const belowVwap = price <= vwap;
  const rsiBuyOk = rsi >= RSI_BUY_MIN && rsi <= RSI_BUY_MAX;
  const rsiSellOk = rsi >= RSI_SELL_MIN && rsi <= RSI_SELL_MAX;

  if (trendUp && aboveVwap && rsiBuyOk) {
    recomendacao = "BUY";
  } else if (trendDown && belowVwap && rsiSellOk) {
    recomendacao = "SELL";
  } else {
    if (trendUp && !aboveVwap) reasons.push("preco_abaixo_vwap");
    if (trendDown && !belowVwap) reasons.push("preco_acima_vwap");
    if (trendUp && !rsiBuyOk) reasons.push(`rsi_fora_zona_buy=${rsi.toFixed(1)}`);
    if (trendDown && !rsiSellOk) reasons.push(`rsi_fora_zona_sell=${rsi.toFixed(1)}`);
  }

  if (thresholds.bloquearSeRiscoElevado && riscoElevado) {
    recomendacao = "WAIT";
    reasons.push(`atr_elevado=${(atrRelativo * 100).toFixed(2)}%`);
  }

  const tamanhoPosicaoPct = computePositionSize(recomendacao, atrRelativo, maxAtr);
  const observacao = [
    `ema9=${ema9.toFixed(2)}`,
    `ema21=${ema21.toFixed(2)}`,
    `vwap=${vwap.toFixed(2)}`,
    `rsi=${rsi.toFixed(1)}`,
    `atrRel=${(atrRelativo * 100).toFixed(2)}%`,
    `spread=${(emaSpreadPct * 100).toFixed(3)}%`,
    reasons.length ? `block=${reasons.join(",")}` : "ok",
  ].join(" ");

  return { origem: "baseline", recomendacao, tamanhoPosicaoPct, riscoElevado, observacao };
}

export const decideBaseline = evaluateBaseline;
