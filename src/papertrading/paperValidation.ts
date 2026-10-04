import type { CfdQuoteCandle, ExecutionModelV3Config, ExecutionModelV3Trade } from "./executionModelV3.js";
import { simulateCfdTradeV3 } from "./executionModelV3.js";
import type { ExecutableSignalTicket } from "../signals/executableSignal.js";

export const PAPER_VALIDATION_VERSION = "paper-validation.v1";
export const MAX_RISK_PER_TRADE_PCT = 1;

export interface PaperValidationResult {
  version: typeof PAPER_VALIDATION_VERSION;
  status: "validated" | "blocked";
  reason:
    | "validated"
    | "signal_not_ready"
    | "missing_execution_levels"
    | "invalid_position_size"
    | "risk_limit";
  riskPct: number;
  positionSizePct: number;
  targetPct: number | null;
  stopPct: number | null;
  trade: ExecutionModelV3Trade | null;
}

function finitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be greater than zero`);
  }
}

function blocked(
  reason: PaperValidationResult["reason"],
  riskPct = 0,
  positionSizePct = 0,
  targetPct: number | null = null,
  stopPct: number | null = null,
): PaperValidationResult {
  return {
    version: PAPER_VALIDATION_VERSION,
    status: "blocked",
    reason,
    riskPct,
    positionSizePct,
    targetPct,
    stopPct,
    trade: null,
  };
}

/**
 * Runs a paper-only validation of an executable signal.
 *
 * Risk is measured as percentage of account equity:
 *   riskPct = (positionSizePct / 100) * (stopPct * 100)
 * where positionSizePct is the notional allocation in percent and stopPct
 * is the stop distance as a decimal fraction.
 *
 * This function never creates or routes an order.
 */
export function validatePaperSignal(input: {
  signal: ExecutableSignalTicket;
  signalCandle: CfdQuoteCandle;
  futureCandles: CfdQuoteCandle[];
  executionConfig: ExecutionModelV3Config;
  maxRiskPerTradePct?: number;
}): PaperValidationResult {
  const maxRisk = input.maxRiskPerTradePct ?? MAX_RISK_PER_TRADE_PCT;
  finitePositive("maxRiskPerTradePct", maxRisk);
  if (maxRisk > MAX_RISK_PER_TRADE_PCT) {
    throw new Error(`maxRiskPerTradePct cannot exceed ${MAX_RISK_PER_TRADE_PCT}%`);
  }

  const { signal } = input;
  if (signal.status !== "ready") {
    return blocked("signal_not_ready");
  }

  if (
    signal.side === null ||
    signal.targetPct === null ||
    signal.stopPct === null
  ) {
    return blocked("missing_execution_levels");
  }

  if (
    !Number.isFinite(signal.positionSizePct) ||
    signal.positionSizePct <= 0 ||
    signal.positionSizePct > 100
  ) {
    return blocked("invalid_position_size", 0, 0, signal.targetPct, signal.stopPct);
  }

  const stopDistancePct = signal.stopPct * 100;
  const riskPct = (signal.positionSizePct / 100) * stopDistancePct;

  if (!Number.isFinite(riskPct) || riskPct <= 0 || riskPct > maxRisk) {
    return blocked(
      "risk_limit",
      riskPct,
      signal.positionSizePct,
      signal.targetPct,
      signal.stopPct,
    );
  }

  const trade = simulateCfdTradeV3({
    side: signal.side,
    signalCandle: input.signalCandle,
    futureCandles: input.futureCandles,
    targetPct: signal.targetPct,
    stopPct: signal.stopPct,
    config: input.executionConfig,
  });

  return {
    version: PAPER_VALIDATION_VERSION,
    status: "validated",
    reason: "validated",
    riskPct,
    positionSizePct: signal.positionSizePct,
    targetPct: signal.targetPct,
    stopPct: signal.stopPct,
    trade,
  };
}
