export type InstrumentAssetClass = "crypto_spot" | "cfd";

export type InstrumentVenue = "binance_spot" | "ig" | "xtb";

export interface InstrumentDefinition {
  symbol: string;
  displayName: string;
  assetClass: InstrumentAssetClass;
  venue: InstrumentVenue;
  baseCurrency: string;
  quoteCurrency: string;
  enabled: boolean;
  dataProvider: string;
  metadataStatus: "verified" | "pending_broker_confirmation";
  metadataSource: string;
  minOrderSize: number | null;
  maxOrderSize: number | null;
  leverage: number | null;
  marginPercent: number | null;
  spread: number | null;
  overnightFinancing: number | null;
  commission: number | null;
  tradingHours: string | null;
}

export const INSTRUMENT_REGISTRY: readonly InstrumentDefinition[] = [
  {
    symbol: "BTCUSDT",
    displayName: "Bitcoin / Tether",
    assetClass: "crypto_spot",
    venue: "binance_spot",
    baseCurrency: "BTC",
    quoteCurrency: "USDT",
    enabled: true,
    dataProvider: "Binance Spot",
    metadataStatus: "verified",
    metadataSource: "Binance Spot exchangeInfo endpoint",
    minOrderSize: null,
    maxOrderSize: null,
    leverage: null,
    marginPercent: null,
    spread: null,
    overnightFinancing: null,
    commission: null,
    tradingHours: "24/7",
  },
  {
    symbol: "EURUSD",
    displayName: "Euro / US Dollar CFD",
    assetClass: "cfd",
    venue: "ig",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    enabled: false,
    dataProvider: "TODO_CONFIRMAR_NA_CORRETORA",
    metadataStatus: "pending_broker_confirmation",
    metadataSource: "TODO_CONFIRMAR_NA_CORRETORA",
    minOrderSize: null,
    maxOrderSize: null,
    leverage: null,
    marginPercent: null,
    spread: null,
    overnightFinancing: null,
    commission: null,
    tradingHours: null,
  },
  {
    symbol: "US500",
    displayName: "US 500 CFD",
    assetClass: "cfd",
    venue: "ig",
    baseCurrency: "USD",
    quoteCurrency: "USD",
    enabled: false,
    dataProvider: "TODO_CONFIRMAR_NA_CORRETORA",
    metadataStatus: "pending_broker_confirmation",
    metadataSource: "TODO_CONFIRMAR_NA_CORRETORA",
    minOrderSize: null,
    maxOrderSize: null,
    leverage: null,
    marginPercent: null,
    spread: null,
    overnightFinancing: null,
    commission: null,
    tradingHours: null,
  },
  {
    symbol: "BTCUSD",
    displayName: "Bitcoin / US Dollar CFD",
    assetClass: "cfd",
    venue: "ig",
    baseCurrency: "BTC",
    quoteCurrency: "USD",
    enabled: false,
    dataProvider: "TODO_CONFIRMAR_NA_CORRETORA",
    metadataStatus: "pending_broker_confirmation",
    metadataSource: "TODO_CONFIRMAR_NA_CORRETORA",
    minOrderSize: null,
    maxOrderSize: null,
    leverage: null,
    marginPercent: null,
    spread: null,
    overnightFinancing: null,
    commission: null,
    tradingHours: null,
  },
];

export const DEFAULT_INSTRUMENT_SYMBOL = "BTCUSDT";

export function getInstrument(symbol: string): InstrumentDefinition {
  const normalized = symbol.trim().toUpperCase();
  const instrument = INSTRUMENT_REGISTRY.find((item) => item.symbol === normalized);
  if (!instrument) throw new Error(`Unsupported instrument: ${normalized}`);
  return instrument;
}

export function listEnabledInstruments(): readonly InstrumentDefinition[] {
  return INSTRUMENT_REGISTRY.filter((item) => item.enabled);
}
