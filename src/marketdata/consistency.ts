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
  referenceTimestamp: string | null;
  maxRelativeDeviationBps: number | null;
  thresholdBps: number;
  providers: string[];
}

function candleTimestamp(candle: Kline): number {
  const timestamp = candle.openTime.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Market data candle openTime must be finite");
  }
  return timestamp;
}

function latestAlignedClose(
  inputs: readonly MarketDataConsistencyInput[],
): { timestamp: number; closes: number[] } | null {
  const timestampSets = inputs.map((input) => {
    const timestamps = new Set<number>();
    for (const candle of input.candles) {
      timestamps.add(candleTimestamp(candle));
    }
    return timestamps;
  });

  if (timestampSets.some((timestamps) => timestamps.size === 0)) {
    return null;
  }

  let commonTimestamps = [...timestampSets[0]];
  for (const timestamps of timestampSets.slice(1)) {
    commonTimestamps = commonTimestamps.filter((timestamp) => timestamps.has(timestamp));
    if (!commonTimestamps.length) return null;
  }

  const timestamp = Math.max(...commonTimestamps);
  const closes: number[] = [];

  for (const input of inputs) {
    const candle = input.candles.find(
      (candidate) => candleTimestamp(candidate) === timestamp,
    );
    if (!candle) {
      return null;
    }

    const close = candle.close;
    if (!Number.isFinite(close) || close <= 0) {
      return null;
    }

    closes.push(close);
  }

  return { timestamp, closes };
}

export function evaluateMarketDataConsistency(
  inputs: readonly MarketDataConsistencyInput[],
  maxRelativeDeviationBps = 50,
): MarketDataConsistency {
  if (!Number.isFinite(maxRelativeDeviationBps) || maxRelativeDeviationBps < 0) {
    throw new Error("maxRelativeDeviationBps must be a non-negative finite number");
  }

  const providers = [...new Set(inputs.map((item) => item.provider.trim()).filter(Boolean))];
  const validInputs = inputs.filter(
    (item) => item.provider.trim() && item.candles.length > 0,
  );

  if (validInputs.length < 2) {
    return {
      status: "insufficient_data",
      providerCount: providers.length,
      comparedProviderCount: validInputs.length,
      referenceClose: null,
      referenceTimestamp: null,
      maxRelativeDeviationBps: 0,
      thresholdBps: maxRelativeDeviationBps,
      providers,
    };
  }

  const aligned = latestAlignedClose(validInputs);
  if (!aligned) {
    return {
      status: "insufficient_data",
      providerCount: providers.length,
      comparedProviderCount: 0,
      referenceClose: null,
      referenceTimestamp: null,
      maxRelativeDeviationBps: null,
      thresholdBps: maxRelativeDeviationBps,
      providers,
    };
  }

  const referenceClose = aligned.closes[0];
  let maxDeviationBps = 0;

  for (const close of aligned.closes.slice(1)) {
    const deviationBps = Math.abs((close - referenceClose) / referenceClose) * 10_000;
    maxDeviationBps = Math.max(maxDeviationBps, deviationBps);
  }

  return {
    status: maxDeviationBps <= maxRelativeDeviationBps ? "consistent" : "divergent",
    providerCount: providers.length,
    comparedProviderCount: aligned.closes.length,
    referenceClose,
    referenceTimestamp: new Date(aligned.timestamp).toISOString(),
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
