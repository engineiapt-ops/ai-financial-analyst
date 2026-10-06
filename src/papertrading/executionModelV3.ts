import type { Kline } from "../types.js";

export const EXECUTION_MODEL_V3_VERSION = "execution-model-v3";
export const EXECUTION_MODEL_V3_1_VERSION = "execution-model-v3.1";

export interface CfdQuoteCandle extends Kline {
  bidOpen: number;
  askOpen: number;
  bidHigh: number;
  askHigh: number;
  bidLow: number;
  askLow: number;
  bidClose: number;
  askClose: number;
}

export interface ExecutionModelV3Config {
  commissionPctPerSide: number;
  slippagePctPerSide: number;
  overnightFinancingPctPerDay: number;
  leverage: number;
  stopOutMarginLevelPct: number;
  tradingHours?: (candle: CfdQuoteCandle) => boolean;
}

export interface ExecutionModelV3_1Config extends ExecutionModelV3Config {
  longFinancingPctPerDay?: number;
  shortFinancingPctPerDay?: number;
}

export interface ExecutionModelV3Trade {
  version: typeof EXECUTION_MODEL_V3_VERSION | typeof EXECUTION_MODEL_V3_1_VERSION;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number | null;
  targetPrice: number;
  stopPrice: number;
  outcome: "win" | "loss" | "open" | "blocked";
  exitReason: "target" | "stop" | "gap" | "stop_out" | "end" | "outside_hours";
  grossProfitPercent: number;
  netProfitPercent: number;
  commissionPercent: number;
  slippagePercent: number;
  spreadPercent: number;
  financingPercent: number;
  marginRequiredPercent: number;
  candlesHeld: number;
}

function finitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero`);
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
}

function validateConfig(config: ExecutionModelV3Config): void {
  finiteNonNegative("commissionPctPerSide", config.commissionPctPerSide);
  finiteNonNegative("slippagePctPerSide", config.slippagePctPerSide);
  finiteNonNegative("overnightFinancingPctPerDay", config.overnightFinancingPctPerDay);
  finitePositive("leverage", config.leverage);
  if (!Number.isFinite(config.stopOutMarginLevelPct) || config.stopOutMarginLevelPct < 0) {
    throw new Error("stopOutMarginLevelPct must be non-negative");
  }
}

function validateCandle(candle: CfdQuoteCandle): void {
  const values = [
    candle.open, candle.high, candle.low, candle.close,
    candle.bidOpen, candle.askOpen, candle.bidHigh, candle.askHigh,
    candle.bidLow, candle.askLow, candle.bidClose, candle.askClose,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("CFD quote candle contains invalid prices");
  }
  if (candle.bidOpen > candle.askOpen || candle.bidHigh > candle.askHigh ||
      candle.bidLow > candle.askLow || candle.bidClose > candle.askClose) {
    throw new Error("CFD bid price cannot exceed ask price");
  }
}

function entryRawPrice(side: "BUY" | "SELL", candle: CfdQuoteCandle): number {
  return side === "BUY" ? candle.askOpen : candle.bidOpen;
}

function adverseSlippage(side: "BUY" | "SELL", price: number, pct: number): number {
  return side === "BUY" ? price * (1 + pct) : price * (1 - pct);
}

function exitRawPrice(side: "BUY" | "SELL", candle: CfdQuoteCandle): { open: number; high: number; low: number; close: number } {
  return side === "BUY"
    ? { open: candle.bidOpen, high: candle.bidHigh, low: candle.bidLow, close: candle.bidClose }
    : { open: candle.askOpen, high: candle.askHigh, low: candle.askLow, close: candle.askClose };
}

function crossedOvernightDays(previous: Date, current: Date): number {
  const start = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate());
  const end = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function spreadPercentForEntry(side: "BUY" | "SELL", candle: CfdQuoteCandle, signalEntry: number): number {
  const spread = Math.abs(candle.askOpen - candle.bidOpen);
  return (spread / signalEntry) * 100;
}

function financingRateForSide(side: "BUY" | "SELL", config: ExecutionModelV3_1Config): number {
  if (side === "BUY") {
    return config.longFinancingPctPerDay ?? config.overnightFinancingPctPerDay;
  }
  return config.shortFinancingPctPerDay ?? config.overnightFinancingPctPerDay;
}

export function simulateCfdTradeV3(input: {
  side: "BUY" | "SELL";
  signalCandle: CfdQuoteCandle;
  futureCandles: CfdQuoteCandle[];
  targetPct: number;
  stopPct: number;
  config: ExecutionModelV3Config;
}): ExecutionModelV3Trade {
  validateConfig(input.config);
  validateCandle(input.signalCandle);
  input.futureCandles.forEach(validateCandle);

  finitePositive("targetPct", input.targetPct);
  finitePositive("stopPct", input.stopPct);

  const side = input.side;
  const direction = side === "BUY" ? 1 : -1;
  const signalEntry = entryRawPrice(side, input.signalCandle);
  const entryPrice = adverseSlippage(side, signalEntry, input.config.slippagePctPerSide);
  const targetPrice = entryPrice * (1 + direction * input.targetPct);
  const stopPrice = entryPrice * (1 - direction * input.stopPct);
  const marginRequiredPercent = 100 / input.config.leverage;
  const entryCommission = input.config.commissionPctPerSide;
  let financingPercent = 0;
  let totalSlippagePercent = Math.abs(entryPrice - signalEntry) / signalEntry * 100;
  let previousTime = input.signalCandle.closeTime ?? input.signalCandle.openTime;

  if (input.config.tradingHours && !input.config.tradingHours(input.signalCandle)) {
    return {
      version: EXECUTION_MODEL_V3_VERSION, side, entryPrice, exitPrice: null, targetPrice, stopPrice,
      outcome: "blocked", exitReason: "outside_hours", grossProfitPercent: 0, netProfitPercent: 0,
      commissionPercent: 0, slippagePercent: 0, spreadPercent: 0, financingPercent: 0,
      marginRequiredPercent, candlesHeld: 0,
    };
  }

  for (let index = 0; index < input.futureCandles.length; index += 1) {
    const candle = input.futureCandles[index];
    const quote = exitRawPrice(side, candle);
    financingPercent += crossedOvernightDays(previousTime, candle.openTime) * input.config.overnightFinancingPctPerDay;
    previousTime = candle.closeTime ?? candle.openTime;

    if (input.config.tradingHours && !input.config.tradingHours(candle)) continue;

    const gapHitsStop = direction === 1 ? quote.open <= stopPrice : quote.open >= stopPrice;
    const gapHitsTarget = direction === 1 ? quote.open >= targetPrice : quote.open <= targetPrice;
    const hitStop = direction === 1 ? quote.low <= stopPrice : quote.high >= stopPrice;
    const hitTarget = direction === 1 ? quote.high >= targetPrice : quote.low <= targetPrice;

    let exitReason: ExecutionModelV3Trade["exitReason"] | null = null;
    let rawExitPrice = quote.close;

    if (gapHitsStop) {
      exitReason = "gap";
      rawExitPrice = quote.open;
    } else if (gapHitsTarget) {
      exitReason = "gap";
      rawExitPrice = quote.open;
    } else if (hitStop || hitTarget) {
      exitReason = hitStop ? "stop" : "target";
      rawExitPrice = hitStop ? stopPrice : targetPrice;
    }

    const equityMarginLevelPct = 100 * (1 + direction * ((quote.close - entryPrice) / entryPrice)) / marginRequiredPercent;
    if (equityMarginLevelPct <= input.config.stopOutMarginLevelPct) {
      exitReason = "stop_out";
      rawExitPrice = quote.close;
    }

    if (!exitReason) continue;

    const exitPrice = adverseSlippage(side, rawExitPrice, input.config.slippagePctPerSide);
    totalSlippagePercent += Math.abs(exitPrice - rawExitPrice) / rawExitPrice * 100;
    const grossProfitPercent = ((exitPrice - entryPrice) / entryPrice) * direction * 100;
    const exitCommission = input.config.commissionPctPerSide;
    const spreadPercent = spreadPercentForEntry(side, input.signalCandle, signalEntry);
    const commissionPercent = entryCommission + exitCommission;
    const netProfitPercent = grossProfitPercent - commissionPercent - totalSlippagePercent - financingPercent;

    return {
      version: EXECUTION_MODEL_V3_VERSION, side, entryPrice, exitPrice, targetPrice, stopPrice,
      outcome: exitReason === "target" ? "win" : "loss", exitReason,
      grossProfitPercent, netProfitPercent, commissionPercent, slippagePercent: totalSlippagePercent,
      spreadPercent, financingPercent, marginRequiredPercent, candlesHeld: index + 1,
    };
  }

  return {
    version: EXECUTION_MODEL_V3_VERSION, side, entryPrice, exitPrice: null, targetPrice, stopPrice,
    outcome: "open", exitReason: "end", grossProfitPercent: 0, netProfitPercent: 0,
    commissionPercent: entryCommission, slippagePercent: totalSlippagePercent,
    spreadPercent: spreadPercentForEntry(side, input.signalCandle, signalEntry),
    financingPercent, marginRequiredPercent, candlesHeld: input.futureCandles.length,
  };
}

export function simulateCfdTradeV3_1(input: {
  side: "BUY" | "SELL";
  signalCandle: CfdQuoteCandle;
  futureCandles: CfdQuoteCandle[];
  targetPct: number;
  stopPct: number;
  config: ExecutionModelV3_1Config;
}): ExecutionModelV3Trade {
  validateConfig(input.config);
  validateCandle(input.signalCandle);
  input.futureCandles.forEach(validateCandle);

  finitePositive("targetPct", input.targetPct);
  finitePositive("stopPct", input.stopPct);

  const side = input.side;
  const direction = side === "BUY" ? 1 : -1;
  const signalEntry = entryRawPrice(side, input.signalCandle);
  const entryPrice = adverseSlippage(side, signalEntry, input.config.slippagePctPerSide);
  const targetPrice = entryPrice * (1 + direction * input.targetPct);
  const stopPrice = entryPrice * (1 - direction * input.stopPct);
  const marginRequiredPercent = 100 / input.config.leverage;
  const entryCommission = input.config.commissionPctPerSide;
  const spreadPercent = spreadPercentForEntry(side, input.signalCandle, signalEntry);
  let financingPercent = 0;
  let totalSlippagePercent = Math.abs(entryPrice - signalEntry) / signalEntry * 100;
  let previousTime = input.signalCandle.closeTime ?? input.signalCandle.openTime;

  if (input.config.tradingHours && !input.config.tradingHours(input.signalCandle)) {
    return {
      version: EXECUTION_MODEL_V3_1_VERSION, side, entryPrice, exitPrice: null, targetPrice, stopPrice,
      outcome: "blocked", exitReason: "outside_hours", grossProfitPercent: 0, netProfitPercent: 0,
      commissionPercent: 0, slippagePercent: 0, spreadPercent: 0, financingPercent: 0,
      marginRequiredPercent, candlesHeld: 0,
    };
  }

  for (let index = 0; index < input.futureCandles.length; index += 1) {
    const candle = input.futureCandles[index];
    const quote = exitRawPrice(side, candle);
    financingPercent += crossedOvernightDays(previousTime, candle.openTime) * financingRateForSide(side, input.config);
    previousTime = candle.closeTime ?? candle.openTime;

    if (input.config.tradingHours && !input.config.tradingHours(candle)) continue;

    const gapHitsStop = direction === 1 ? quote.open <= stopPrice : quote.open >= stopPrice;
    const gapHitsTarget = direction === 1 ? quote.open >= targetPrice : quote.open <= targetPrice;
    const hitStop = direction === 1 ? quote.low <= stopPrice : quote.high >= stopPrice;
    const hitTarget = direction === 1 ? quote.high >= targetPrice : quote.low <= targetPrice;

    let exitReason: ExecutionModelV3Trade["exitReason"] | null = null;
    let rawExitPrice = quote.close;

    if (gapHitsStop) {
      exitReason = "gap";
      rawExitPrice = quote.open;
    } else if (gapHitsTarget) {
      exitReason = "gap";
      rawExitPrice = quote.open;
    } else if (hitStop || hitTarget) {
      exitReason = hitStop ? "stop" : "target";
      rawExitPrice = hitStop ? stopPrice : targetPrice;
    }

    const equityMarginLevelPct = 100 * (1 + direction * ((quote.close - entryPrice) / entryPrice)) / marginRequiredPercent;
    if (equityMarginLevelPct <= input.config.stopOutMarginLevelPct) {
      exitReason = "stop_out";
      rawExitPrice = quote.close;
    }

    if (!exitReason) continue;

    const exitPrice = adverseSlippage(side, rawExitPrice, input.config.slippagePctPerSide);
    totalSlippagePercent += Math.abs(exitPrice - rawExitPrice) / rawExitPrice * 100;
    const grossProfitPercent = ((exitPrice - entryPrice) / entryPrice) * direction * 100;
    const exitCommission = input.config.commissionPctPerSide;
    const commissionPercent = entryCommission + exitCommission;
    const netProfitPercent = grossProfitPercent - commissionPercent - totalSlippagePercent - financingPercent;
    const outcome = netProfitPercent > 0 ? "win" : "loss";

    return {
      version: EXECUTION_MODEL_V3_1_VERSION, side, entryPrice, exitPrice, targetPrice, stopPrice,
      outcome, exitReason,
      grossProfitPercent, netProfitPercent, commissionPercent, slippagePercent: totalSlippagePercent,
      spreadPercent, financingPercent, marginRequiredPercent, candlesHeld: index + 1,
    };
  }

  return {
    version: EXECUTION_MODEL_V3_1_VERSION, side, entryPrice, exitPrice: null, targetPrice, stopPrice,
    outcome: "open", exitReason: "end", grossProfitPercent: 0, netProfitPercent: 0,
    commissionPercent: entryCommission, slippagePercent: totalSlippagePercent,
    spreadPercent, financingPercent, marginRequiredPercent, candlesHeld: input.futureCandles.length,
  };
}

export const simulateCfdTradeV31 = simulateCfdTradeV3_1;
