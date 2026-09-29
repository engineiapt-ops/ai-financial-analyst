import type { Kline, Indicators } from "../types.js";

/**
 * FEATURE ENGINE TÉCNICO (DETERMINÍSTICO)
 *
 * Módulo puramente funcional, matemático e sem efeitos colaterais.
 * Não acessa rede, Binance, Jev, GPT ou regras de trading.
 *
 * REQUISITOS DE DADOS MÍNIMOS:
 * - VWAP: no mínimo 1 candle com volume utilizável.
 * - EMA 9: no mínimo 9 valores de fechamento.
 * - EMA 21: no mínimo 21 valores de fechamento.
 * - RSI 14: no mínimo 15 preços de fechamento (14 variações consecutivas).
 * - ATR 14: no mínimo 15 candles (1 candle de referência inicial + 14 True Ranges).
 *
 * Quando os dados forem insuficientes, retorna `null`.
 * Nunca inventa valores arbitrários (como 50 ou 0) para mascarar dados insuficientes.
 */

export const MIN_DATA_POINTS = {
  VWAP: 1,
  EMA9: 9,
  EMA21: 21,
  RSI14: 15,
  ATR14: 15,
} as const;

/**
 * Calcula o Preço Típico (Typical Price) de um candle:
 * Typical Price = (High + Low + Close) / 3
 */
export function typicalPrice(kline: Kline): number {
  return (kline.high + kline.low + kline.close) / 3;
}

/**
 * 1. VWAP (Volume Weighted Average Price)
 *
 * Metodologia Oficial:
 * Typical Price = (High + Low + Close) / 3
 * VWAP = Σ(Typical Price × Volume) / Σ(Volume)
 *
 * Requisito mínimo: 1 candle.
 * Retorna `null` se klines for vazio.
 * Se Σ(Volume) == 0, faz fallback determinístico para o último preço de fechamento.
 */
export function vwap(klines: Kline[]): number | null {
  if (klines.length < MIN_DATA_POINTS.VWAP) {
    return null;
  }

  let cumPV = 0;
  let cumVol = 0;

  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    const tp = typicalPrice(k);
    cumPV += tp * k.volume;
    cumVol += k.volume;
  }

  if (cumVol === 0) {
    return klines[klines.length - 1].close;
  }

  return cumPV / cumVol;
}

/**
 * Série temporal cumulativa do VWAP candle a candle.
 */
export function vwapSeries(klines: Kline[]): (number | null)[] {
  if (klines.length === 0) return [];

  const out: (number | null)[] = [];
  let cumPV = 0;
  let cumVol = 0;

  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    const tp = typicalPrice(k);
    cumPV += tp * k.volume;
    cumVol += k.volume;
    out.push(cumVol === 0 ? k.close : cumPV / cumVol);
  }

  return out;
}

/**
 * 2. EMA (Exponential Moving Average)
 *
 * Metodologia Oficial:
 * - Requer no mínimo `period` valores.
 * - Semente inicial no índice `period - 1`: Média Móvel Simples (SMA) dos primeiros `period` valores.
 * - Multiplicador: k = 2 / (period + 1)
 * - EMA_t = values[t] * k + EMA_{t-1} * (1 - k)
 *
 * Retorna série com `null` para índices < `period - 1`.
 */
export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("Período da EMA deve ser maior que zero");
  if (values.length === 0) return [];

  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) {
    return out;
  }

  // Semente: SMA dos primeiros `period` elementos
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let currentEma = sum / period;
  out[period - 1] = currentEma;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    out[i] = currentEma;
  }

  return out;
}

/**
 * Retorna o valor mais recente da EMA para o período fornecido.
 * Se values.length < period, retorna `null`.
 */
export function emaLatest(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }
  const series = ema(values, period);
  return series[series.length - 1];
}

/**
 * 3. RSI (Relative Strength Index)
 *
 * Metodologia Congelada: Wilder's Smoothing (RMA) — Padrão Oficial Binance / TradingView / TA-Lib.
 *
 * Requisito mínimo: `period + 1` preços de fechamento (15 preços para período 14).
 * Se closes.length < period + 1, retorna `null`.
 *
 * Cálculo:
 * 1. diff = closes[i] - closes[i - 1]
 * 2. Primeiros `period` deltas:
 *    avgGain_0 = Σ(gains dos primeiros period deltas) / period
 *    avgLoss_0 = Σ(losses dos primeiros period deltas) / period
 * 3. Deltas subsequentes (Wilder's Smoothing):
 *    avgGain_t = (avgGain_{t-1} * (period - 1) + currentGain) / period
 *    avgLoss_t = (avgLoss_{t-1} * (period - 1) + currentLoss) / period
 * 4. RS e RSI:
 *    Se avgLoss == 0 e avgGain == 0 => 50 (preço sem variação)
 *    Se avgLoss == 0 => 100 (apenas altas)
 *    Se avgGain == 0 => 0 (apenas baixas)
 *    RS = avgGain / avgLoss
 *    RSI = 100 - (100 / (1 + RS))
 */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) {
    return null;
  }

  const series = rsiSeries(closes, period);
  return series[series.length - 1];
}

/**
 * Retorna a série histórica de RSI calculada com a metodologia oficial de Wilder.
 * Os primeiros `period` índices (0 até period-1) recebem `null`.
 */
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  if (closes.length === 0) return [];
  const out: (number | null)[] = new Array(closes.length).fill(null);

  if (closes.length < period + 1) {
    return out;
  }

  // 1. Calcula deltas
  const deltas: number[] = new Array(closes.length - 1);
  for (let i = 1; i < closes.length; i++) {
    deltas[i - 1] = closes[i] - closes[i - 1];
  }

  // 2. Média inicial simples para os primeiros `period` deltas
  let sumGain = 0;
  let sumLoss = 0;
  for (let i = 0; i < period; i++) {
    const d = deltas[i];
    if (d > 0) sumGain += d;
    else sumLoss += Math.abs(d);
  }

  let avgGain = sumGain / period;
  let avgLoss = sumLoss / period;

  function calculateRsi(gain: number, loss: number): number {
    if (loss === 0 && gain === 0) return 50;
    if (loss === 0) return 100;
    if (gain === 0) return 0;
    const rs = gain / loss;
    const val = 100 - 100 / (1 + rs);
    return Math.max(0, Math.min(100, val));
  }

  out[period] = calculateRsi(avgGain, avgLoss);

  // 3. Suavização de Wilder para os deltas subsequentes
  for (let i = period; i < deltas.length; i++) {
    const d = deltas[i];
    const currentGain = d > 0 ? d : 0;
    const currentLoss = d < 0 ? Math.abs(d) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    out[i + 1] = calculateRsi(avgGain, avgLoss);
  }

  return out;
}

/**
 * Calcula o True Range (TR) de um candle:
 * TR = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
 */
export function trueRange(current: Kline, previous?: Kline): number {
  if (!previous) {
    return current.high - current.low;
  }
  const hl = current.high - current.low;
  const hpc = Math.abs(current.high - previous.close);
  const lpc = Math.abs(current.low - previous.close);
  return Math.max(hl, hpc, lpc);
}

/**
 * 4. ATR (Average True Range)
 *
 * Metodologia Congelada: Wilder's Smoothing (RMA) — Padrão Oficial Binance / TradingView / TA-Lib.
 *
 * Requisito mínimo: `period + 1` candles (15 candles para período 14).
 * Se klines.length < period + 1, retorna `null`.
 *
 * Cálculo:
 * 1. Para cada candle i >= 1, calcula TR_i em relação ao candle i-1.
 * 2. ATR inicial no candle index `period`:
 *    ATR_0 = Σ(TR_1 até TR_period) / period
 * 3. Candles subsequentes (Wilder's Smoothing):
 *    ATR_t = (ATR_{t-1} * (period - 1) + TR_t) / period
 */
export function atr(klines: Kline[], period = 14): number | null {
  if (klines.length < period + 1) {
    return null;
  }

  const series = atrSeries(klines, period);
  return series[series.length - 1];
}

/**
 * Retorna a série histórica de ATR calculada com a metodologia oficial de Wilder.
 * Os primeiros `period` índices (0 até period-1) recebem `null`.
 */
export function atrSeries(klines: Kline[], period = 14): (number | null)[] {
  if (klines.length === 0) return [];
  const out: (number | null)[] = new Array(klines.length).fill(null);

  if (klines.length < period + 1) {
    return out;
  }

  // 1. Calcula True Ranges para i >= 1
  const trs: number[] = new Array(klines.length - 1);
  for (let i = 1; i < klines.length; i++) {
    trs[i - 1] = trueRange(klines[i], klines[i - 1]);
  }

  // 2. Média inicial simples para os primeiros `period` TRs
  let sumTR = 0;
  for (let i = 0; i < period; i++) {
    sumTR += trs[i];
  }

  let currentAtr = sumTR / period;
  out[period] = currentAtr;

  // 3. Suavização de Wilder para os TRs subsequentes
  for (let i = period; i < trs.length; i++) {
    currentAtr = (currentAtr * (period - 1) + trs[i]) / period;
    out[i + 1] = currentAtr;
  }

  return out;
}

/**
 * 5. COMPUTAÇÃO CONSOLIDADA DE INDICADORES (Snapshot)
 *
 * Retorna o objeto estrito `Indicators` com todos os 5 valores técnicos.
 * Cada valor técnico será `number` se os dados mínimos forem atendidos,
 * ou `null` caso os dados sejam insuficientes.
 */
export function computeIndicators(klines: Kline[]): Indicators {
  const closes = klines.map((k) => k.close);

  return {
    vwap: vwap(klines),
    ema9: emaLatest(closes, 9),
    ema21: emaLatest(closes, 21),
    rsi: rsi(closes, 14),
    atr: atr(klines, 14),
  };
}

/**
 * Computa a série temporal consolidada de Indicators para cada candle da série temporal.
 * Cada elemento da série reflete exatamente o estado calculável naquele momento
 * (sem lookahead bias), contendo `null` para indicadores que ainda não atingiram
 * o aquecimento mínimo de dados.
 */
export function computeIndicatorsSeries(klines: Kline[]): Indicators[] {
  if (klines.length === 0) return [];

  const out: Indicators[] = [];
  for (let i = 1; i <= klines.length; i++) {
    const slice = klines.slice(0, i);
    out.push(computeIndicators(slice));
  }
  return out;
}
