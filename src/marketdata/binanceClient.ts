import WebSocket from "ws";
import type { Kline, Timeframe } from "../types.js";

const REST_BASE = process.env.BINANCE_REST_BASE ?? "https://api.binance.com";
const WS_BASE = process.env.BINANCE_WS_BASE ?? "wss://stream.binance.com:9443/ws";

function tfToInterval(tf: Timeframe): string {
  return { "1h": "1h", "4h": "4h", "1d": "1d" }[tf];
}

export async function fetchKlines(symbol: string, timeframe: Timeframe, limit = 500): Promise<Kline[]> {
  const interval = tfToInterval(timeframe);
  const url = `${REST_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance REST error: ${res.status} ${res.statusText}`);
  const raw = await res.json() as any[];
  return raw.map(k => ({
    openTime: new Date(k[0]), open: Number(k[1]), high: Number(k[2]),
    low: Number(k[3]), close: Number(k[4]), volume: Number(k[5])
  }));
}

export function subscribeKlineStream(symbol: string, timeframe: Timeframe, onClosedCandle: (candle: Kline) => void): WebSocket {
  const interval = tfToInterval(timeframe);
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(`${WS_BASE}/${stream}`);
  ws.on("message", raw => {
    const msg = JSON.parse(raw.toString());
    const k = msg.k;
    if (!k?.x) return;
    onClosedCandle({
      openTime: new Date(k.t), open: Number(k.o), high: Number(k.h),
      low: Number(k.l), close: Number(k.c), volume: Number(k.v)
    });
  });
  ws.on("error", err => console.error(`[binance-ws:${symbol}:${timeframe}]`, err));
  return ws;
}
