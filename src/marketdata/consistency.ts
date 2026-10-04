import type { Kline } from "../types.js";

export interface MarketDataConsistencyInput {
  provider: string;
  candles: readonly Kline[];
}

export interface MarketDataConsistency {
  status: "consistent" | "insufficient_data" | "divergent";
  providerCount: number;
  comparedProviderCount: number;
  referenceClose: number | null;
  maxRelativeDeviationBps: number | null;
  thresholdBps: number;
  providers: string[];
}

function latestClose(input: MarketDataConsistencyInput): number | null {
  const candle = input.candles[input.candles.length - 1];
  return candle?.close ?? null;
}

export function evaluateMarketDataConsistency(
  inputs: readonly MarketDataConsistencyInput[],
  maxRelativeDeviationBps = 50,
): MarketDataConsistency {
  if (!Number.isFinite(maxRelativeDeviationBps) || maxRelativeDeviationBps < 0) {
    throw new Error("maxRelativeDeviationBps must be a non-negative finite number");
  }

  const providers = [...new Set(inputs.map((item) => item.provider.trim()).filter(Boolean))];
  const quotes = inputs
    .map((item) => ({ provider: item.provider.trim(), close: latestClose(item) }))
    .filter((item): item is { provider: string; close: number } =>
      Boolean(item.provider) && item.close !== null && Number.isFinite(item.close) && item.close > 0,
    );

  if (quotes.length < 2) {
    return {
      status: "insufficient_data",
      providerCount: providers.length,
      comparedProviderCount: quotes.length,
      referenceClose: quotes[0]?.close ?? null,
      maxRelativeDeviationBps: 0,
      thresholdBps: maxRelativeDeviationBps,
      providers,
    };
  }

  const referenceClose = quotes[0].close;
  let maxDeviationBps = 0;

  for (const quote of quotes.slice(1)) {
    const deviationBps = Math.abs((quote.close - referenceClose) / referenceClose) * 10_000;
    maxDeviationBps = Math.max(maxDeviationBps, deviationBps);
  }

  return {
    status: maxDeviationBps <= maxRelativeDeviationBps ? "consistent" : "divergent",
    providerCount: providers.length,
    comparedProviderCount: quotes.length,
    referenceClose,
    maxRelativeDeviationBps: maxDeviationBps,
    thresholdBps: maxRelativeDeviationBps,
    providers,
  };
}

export function assertMarketDataConsistency(
  inputs: readonly MarketDataConsistencyInput[],
  maxRelativeDeviationBps = 50,
): MarketDataConsistency {
  const result = evaluateMarketDataConsistency(inputs, maxRelativeDeviationBps);
  if (result.status === "divergent") {
    throw new Error(
      `Market data providers diverged: ${result.maxRelativeDeviationBps?.toFixed(2)}bps > ${result.thresholdBps}bps`,
    );
  }
  return result;
}
