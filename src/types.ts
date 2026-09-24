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
  vwap: number;
  ema9: number;
  ema21: number;
  rsi: number;
  atr: number;
}

export interface MarketState {
  ativo: string;
  timeframe: Timeframe;
  timestamp: number;
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
  riscoElevado?: boolean;
  jevChoice?: "ALTA" | "BAIXA" | "AGUARDAR";
  jevProbs?: Record<string, number>;
  jevModelVersion?: string;
  observacao?: string;
}
