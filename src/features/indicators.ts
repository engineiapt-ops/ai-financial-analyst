import type { Kline, Indicators } from "../types.js";

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function vwap(klines: Kline[]): number {
  let cumPV = 0, cumVol = 0;
  for (const k of klines) {
    const typicalPrice = (k.high + k.low + k.close) / 3;
    cumPV += typicalPrice * k.volume;
    cumVol += k.volume;
  }
  return cumVol === 0 ? klines.at(-1)!.close : cumPV / cumVol;
}

export function atr(klines: Kline[], period = 14): number {
  if (klines.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const cur = klines[i], prevClose = klines[i - 1].close;
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose)));
  }
  const window = trs.slice(-period);
  return window.reduce((a, b) => a + b, 0) / window.length;
}

export function computeIndicators(klines: Kline[]): Indicators {
  const closes = klines.map(k => k.close);
  return {
    vwap: vwap(klines),
    ema9: ema(closes, 9).at(-1)!,
    ema21: ema(closes, 21).at(-1)!,
    rsi: rsi(closes),
    atr: atr(klines),
  };
}
