import WebSocket from "ws";
import type { Kline, Timeframe } from "../types.js";

const configuredRestBase = process.env.BINANCE_REST_BASE?.trim();
const configuredWsBase = process.env.BINANCE_WS_BASE?.trim();

// Vercel can expose an unset/empty environment variable as an empty string.
// Never build an absolute fetch URL from a relative/empty base.
const REST_BASE = configuredRestBase?.startsWith("http")
  ? configuredRestBase.replace(/\/$/, "")
  : "https://api.binance.com";
const WS_BASE = configuredWsBase?.startsWith("ws")
  ? configuredWsBase.replace(/\/$/, "")
  : "wss://stream.binance.com:9443/ws";

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
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  onCandleUpdate?: (candle: Kline, isClosed: boolean) => void;
  onError?: (err: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onReconnect?: (attempt: number, delayMs: number) => void;
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
 * Subclasse de WebSocket que adiciona reconexão automática com backoff progressivo,
 * prevenção de múltiplas conexões simultâneas e encerramento limpo.
 */
export class ReconnectingKlineWebSocket extends WebSocket {
  private _symbol: string;
  private _timeframe: Timeframe;
  private _onClosedCandle: (candle: Kline) => void;
  private _options: StreamOptions;
  private _isManualClose = false;
  private _reconnectAttempts = 0;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _activeWs: WebSocket | null = null;

  constructor(
    symbol: string,
    timeframe: Timeframe,
    onClosedCandle: (candle: Kline) => void,
    options: StreamOptions = {}
  ) {
    const cleanSymbol = symbol.trim().toLowerCase();
    const interval = tfToInterval(timeframe);
    const stream = `${cleanSymbol}@kline_${interval}`;
    const url = `${WS_BASE}/${stream}`;

    super(url);

    this._symbol = symbol;
    this._timeframe = timeframe;
    this._onClosedCandle = onClosedCandle;
    this._options = options;
    this._activeWs = this;

    this._attachSocketListeners(this);
  }

  public get isManualClose(): boolean {
    return this._isManualClose;
  }

  public get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  public get activeSocket(): WebSocket {
    return this._activeWs ?? this;
  }

  /**
   * Força a destruição do socket TCP subjacente sem marcar fechamento manual,
   * reproduzindo de forma fidedigna uma perda abrupta de conexão de rede (código 1006).
   */
  public simulateNetworkDrop(): void {
    const rawSocket = (this._activeWs as any)?._socket ?? (this as any)?._socket;
    if (rawSocket && typeof rawSocket.destroy === "function") {
      rawSocket.destroy(new Error("Simulated network drop"));
    }
  }

  /**
   * Processa o payload bruto de mensagem do stream da Binance.
   * Dispara onCandleUpdate (se configurado) e onClosedCandle estritamente quando k.x === true.
   */
  public processMessagePayload(rawString: string): { candle: Kline; isClosed: boolean } | null {
    try {
      const msg = JSON.parse(rawString);
      const k = msg.k;
      if (!k) return null;

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
      this._options.onCandleUpdate?.(candle, isClosed);

      if (isClosed) {
        this._onClosedCandle(candle);
      }

      return { candle, isClosed };
    } catch (parseErr: any) {
      const err = new Error(`Falha no parse da mensagem WS Binance: ${parseErr.message}`);
      this._options.onError?.(err);
      this.emit("error", err);
      return null;
    }
  }

  private _attachSocketListeners(target: WebSocket): void {
    target.on("open", () => {
      this._reconnectAttempts = 0;
      this._options.onOpen?.();
      if (target !== this) {
        this.emit("open");
      }
    });

    target.on("message", (raw: WebSocket.RawData) => {
      this.processMessagePayload(raw.toString());
      if (target !== this) {
        this.emit("message", raw);
      }
    });

    target.on("error", (err: Error) => {
      console.error(`[binance-ws:${this._symbol}:${this._timeframe}]`, err.message);
      this._options.onError?.(err);
      if (target !== this) {
        this.emit("error", err);
      }
    });

    target.on("close", (code: number, reason: Buffer) => {
      this._options.onClose?.();
      if (target !== this) {
        this.emit("close", code, reason);
      }
      this._scheduleReconnect();
    });
  }

  private _scheduleReconnect(): void {
    if (this._isManualClose) return;
    const autoReconnect = this._options.autoReconnect ?? true;
    if (!autoReconnect) return;

    const maxAttempts = this._options.maxReconnectAttempts ?? 10;
    if (this._reconnectAttempts >= maxAttempts) {
      console.warn(`[binance-ws:${this._symbol}:${this._timeframe}] Limite de ${maxAttempts} tentativas de reconexão atingido.`);
      return;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._reconnectAttempts++;
    // Backoff progressivo: 1s, 2s, 4s, 8s, 16s... com teto configurável (default 30s)
    const initialBackoff = this._options.initialBackoffMs ?? 1000;
    const maxBackoff = this._options.maxBackoffMs ?? 30000;
    const delayMs = Math.min(initialBackoff * Math.pow(2, this._reconnectAttempts - 1), maxBackoff);

    this._options.onReconnect?.(this._reconnectAttempts, delayMs);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._isManualClose) return;

      const cleanSymbol = this._symbol.trim().toLowerCase();
      const interval = tfToInterval(this._timeframe);
      const stream = `${cleanSymbol}@kline_${interval}`;
      const url = `${WS_BASE}/${stream}`;

      const newWs = new WebSocket(url);
      this._activeWs = newWs;
      this._attachSocketListeners(newWs);
    }, delayMs);
  }

  public override terminate(): void {
    this._isManualClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._activeWs && this._activeWs !== this) {
      try {
        this._activeWs.terminate();
      } catch {}
    }
    super.terminate();
  }

  public override close(code?: number, data?: string | Buffer): void {
    this._isManualClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._activeWs && this._activeWs !== this) {
      try {
        this._activeWs.close(code, data);
      } catch {}
    }
    super.close(code, data);
  }
}

/**
 * Assina o stream de Klines da Binance via WebSocket (<symbol>@kline_<interval>).
 * Retorna uma instância de ReconnectingKlineWebSocket (subclasse de WebSocket),
 * garantindo compatibilidade de tipos e reconexão automática com backoff.
 */
export function subscribeKlineStream(
  symbol: string,
  timeframe: Timeframe,
  onClosedCandle: (candle: Kline) => void,
  options: StreamOptions = {}
): ReconnectingKlineWebSocket {
  return new ReconnectingKlineWebSocket(symbol, timeframe, onClosedCandle, options);
}
