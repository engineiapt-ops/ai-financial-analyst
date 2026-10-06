import type {
  DecisionResult,
  Indicators,
  Kline,
  MarketState,
  Timeframe,
} from "../domain/trading.js";
import { computeIndicators } from "../features/indicators.js";
import type { MarketDataService, MarketDataSnapshot } from "../marketdata/service.js";
import { resolveProviderInstrument } from "../instruments/providerMapping.js";

export interface SaxoDecisionInput {
  symbol: string;
  timeframe: Timeframe;
  engine: "baseline" | "jev";
  limit?: number;
  checkedAt?: Date;
  noticiaSentimento?: number;
}

export interface SaxoDecisionDependencies {
  getSnapshot: (
    request: {
      provider: string;
      instrument: string;
      timeframe: Timeframe;
      limit?: number;
      endTime?: number;
    },
    checkedAt: Date,
  ) => Promise<MarketDataSnapshot>;
  evaluateBaseline: (market: MarketState) => DecisionResult;
  decideWithJev: (
    market: MarketState,
    mode?: "dev" | "oos",
  ) => Promise<DecisionResult>;
}

function buildMarketState(
  symbol: string,
  timeframe: Timeframe,
  snapshot: MarketDataSnapshot,
  noticiaSentimento: number,
): MarketState {
  if (snapshot.candles.length < 21) {
    throw new Error("Insufficient closed Saxo candles for EMA21");
  }

  const last = snapshot.candles[snapshot.candles.length - 1];
  const dataAsOf = last.closeTime ?? last.openTime;
  const indicators: Indicators = computeIndicators(snapshot.candles);

  return {
    ativo: symbol,
    timeframe,
    timestamp: dataAsOf.getTime(),
    dataAsOf: dataAsOf.getTime(),
    precoAtual: last.close,
    indicators,
    noticiaSentimento,
  };
}

export function createSaxoDecisionGateway(
  marketDataService: MarketDataService,
  evaluateBaseline: SaxoDecisionDependencies["evaluateBaseline"],
  decideWithJev: SaxoDecisionDependencies["decideWithJev"],
): (input: SaxoDecisionInput) => Promise<DecisionResult & { market: MarketState; snapshot: MarketDataSnapshot }> {
  return async (input) => {
    const symbol = input.symbol.trim().toUpperCase();
    if (!symbol) throw new Error("Saxo decision symbol is required");

    const checkedAt = input.checkedAt ?? new Date();
    const providerInstrument = resolveProviderInstrument(symbol, "saxo-sim");

    const snapshot = await marketDataService.getSnapshot(
      {
        provider: "saxo-sim",
        instrument: providerInstrument,
        timeframe: input.timeframe,
        limit: input.limit ?? 100,
        endTime: checkedAt.getTime(),
      },
      checkedAt,
    );

    const market = buildMarketState(
      symbol,
      input.timeframe,
      snapshot,
      input.noticiaSentimento ?? 0,
    );

    const decision =
      input.engine === "jev"
        ? await decideWithJev(market)
        : evaluateBaseline(market);

    return { ...decision, market, snapshot };
  };
}
