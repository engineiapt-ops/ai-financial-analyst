import WebSocket from "ws";
import type { Kline, Timeframe } from "../types.js";

const REST_BASE = process.env.BINANCE_REST_BASE ?? "https://api.binance.com";
const WS_BASE = process.env.BINANCE_WS_BASE ?? "wss://stream.binance.com:9443/ws";

export const SUPPORTED_TIMEFRAMES: readonly Timeframe[] = ["1h", "4h", "1d"] as const;

export interface KlineOptions {
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export interface SymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
}

export interface StreamOptions {
  onCandleUpdate?: (candle: Kline, isClosed: boolean) => void;
  onError?: (err: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * Converte o timeframe do modelo para o identificador de intervalo da Binance Spot API.
 */
export function tfToInterval(tf: Timeframe): string {
  const map: Record<Timeframe, string> = { "1h": "1h", "4h": "4h", "1d": "1d" };
  const interval = map[tf];
  if (!interval) {
    throw new Error(`Timeframe não suportado: ${tf}. Suportados: ${SUPPORTED_TIMEFRAMES.join(", ")}`);
  }
  return interval;
}

/**
 * Verifica conectividade básica com a Binance REST API (GET /api/v3/ping).
 */
export async function ping(): Promise<boolean> {
  const url = `${REST_BASE}/api/v3/ping`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance ping falhou com status HTTP ${res.status}: ${res.statusText}`);
  }
  return true;
}

/**
 * Obtém o horário oficial do servidor da Binance (GET /api/v3/time).
 */
export async function getServerTime(): Promise<number> {
  const url = `${REST_BASE}/api/v3/time`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance time falhou com status HTTP ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { serverTime: number };
  return data.serverTime;
}

/**
 * Obtém informações do par/símbolo na Binance Spot (GET /api/v3/exchangeInfo).
 */
export async function getExchangeInfo(symbol = "BTCUSDT"): Promise<SymbolInfo> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const url = `${REST_BASE}/api/v3/exchangeInfo?symbol=${encodeURIComponent(cleanSymbol)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binance exchangeInfo falhou para ${cleanSymbol} (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { symbols: any[] };
  const target = data.symbols?.[0];
  if (!target) {
    throw new Error(`Símbolo ${cleanSymbol} não encontrado na Binance`);
  }
  return {
    symbol: target.symbol,
    status: target.status,
    baseAsset: target.baseAsset,
    quoteAsset: target.quoteAsset,
    isSpotTradingAllowed: target.isSpotTradingAllowed ?? target.status === "TRADING",
  };
}

/**
 * Busca histórico de Klines/Candles da Binance Spot (GET /api/v3/klines).
 * Suporta assinatura simples com número limite ou opções detalhadas (limit, startTime, endTime).
 */
export async function fetchKlines(
  symbol: string,
  timeframe: Timeframe,
  optionsOrLimit: number | KlineOptions = 500
): Promise<Kline[]> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol) {
    throw new Error("Parâmetro symbol é obrigatório");
  }

  const interval = tfToInterval(timeframe);

  let limit = 500;
  let startTime: number | undefined;
  let endTime: number | undefined;

  if (typeof optionsOrLimit === "number") {
    limit = optionsOrLimit;
  } else if (optionsOrLimit) {
    limit = optionsOrLimit.limit ?? 500;
    startTime = optionsOrLimit.startTime;
    endTime = optionsOrLimit.endTime;
  }

  // Clamping 1 a 1000 conforme especificação oficial da Binance
  const clampedLimit = Math.max(1, Math.min(1000, limit));

  const params = new URLSearchParams({
    symbol: cleanSymbol,
    interval,
    limit: String(clampedLimit),
  });

  if (startTime !== undefined) params.set("startTime", String(startTime));
  if (endTime !== undefined) params.set("endTime", String(endTime));

  const url = `${REST_BASE}/api/v3/klines?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Binance REST error HTTP ${res.status} (${res.statusText}): ${errorBody}`);
  }

  const raw = (await res.json()) as any[];
  if (!Array.isArray(raw)) {
    throw new Error("Formato de resposta inesperado retornado pela Binance");
  }

  return raw.map((k) => ({
    openTime: new Date(Number(k[0])),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: new Date(Number(k[6])),
  }));
}

/**
 * Assina o stream de Klines da Binance via WebSocket (<symbol>@kline_<interval>).
 * Dispara onClosedCandle apenas quando o candle estiver fechado (k.x === true).
 */
export function subscribeKlineStream(
  symbol: string,
  timeframe: Timeframe,
  onClosedCandle: (candle: Kline) => void,
  options: StreamOptions = {}
): WebSocket {
  const cleanSymbol = symbol.trim().toLowerCase();
  const interval = tfToInterval(timeframe);
  const stream = `${cleanSymbol}@kline_${interval}`;
  const ws = new WebSocket(`${WS_BASE}/${stream}`);

  ws.on("open", () => {
    options.onOpen?.();
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const k = msg.k;
      if (!k) return;

      const candle: Kline = {
        openTime: new Date(Number(k.t)),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
        closeTime: new Date(Number(k.T)),
      };

      const isClosed = Boolean(k.x);
      options.onCandleUpdate?.(candle, isClosed);

      if (isClosed) {
        onClosedCandle(candle);
      }
    } catch (parseErr: any) {
      options.onError?.(new Error(`Falha no parse da mensagem WS Binance: ${parseErr.message}`));
    }
  });

  ws.on("error", (err) => {
    console.error(`[binance-ws:${symbol}:${timeframe}]`, err);
    options.onError?.(err);
  });

  ws.on("close", () => {
    options.onClose?.();
  });

  return ws;
}
