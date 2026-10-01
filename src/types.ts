export type Timeframe = "1h" | "4h" | "1d";

export interface Kline {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: Date;
}

export interface Indicators {
  vwap: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi: number | null;
  atr: number | null;
}

export interface MarketState {
  ativo: string;
  timeframe: Timeframe;
  timestamp: number;
  dataAsOf: number;
  precoAtual: number;
  indicators: Indicators;
  noticiaSentimento: number;
  macroDolar?: string;
  indicadorMacro?: number;
}

export type Recomendacao = "BUY" | "WAIT" | "SELL";
export type Origem = "jev" | "baseline";

export interface DecisionResult {
  origem: Origem;
  recomendacao: Recomendacao;
  tamanhoPosicaoPct: number;
  qualityScore?: number;
  confidence?: number;
  probabilidadeDirecional?: number;
  riscoElevado?: boolean;
  jevChoice?: "ALTA" | "BAIXA" | "AGUARDAR";
  jevProbs?: Record<string, number>;
  jevModelVersion?: string;
  observacao?: string;
}

// Compatibility bridge for the React presentation layer.
export * from "./types/index.js";
