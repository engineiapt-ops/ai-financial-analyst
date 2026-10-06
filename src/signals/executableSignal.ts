import { FEE_PCT, SLIPPAGE_PCT } from "../papertrading/simulator.js";
import { resolvePriceLevels, type ExecutionLevels } from "../config/executionLevels.js";
import type { DecisionResult, Timeframe } from "../domain/trading.js";
import { assessRiskReward, MIN_RISK_REWARD } from "../quant/riskReward.js";

export const EXECUTABLE_SIGNAL_VERSION = "hourly-signal-v1";

export type ExecutableSignalStatus = "ready" | "not_executable";
export type ExecutableSignalReason =
  | "ready"
  | "wait_decision"
  | "invalid_price"
  | "cost_filter"
  | "risk_reward_filter";

export interface ExecutableSignalTicket {
  version: typeof EXECUTABLE_SIGNAL_VERSION;
  status: ExecutableSignalStatus;
  reason: ExecutableSignalReason;
  ativo: string;
  timeframe: Timeframe;
  dataAsOf: Date;
  side: "BUY" | "SELL" | null;
  positionSizePct: number;
  entrada: number | null;
  alvo: number | null;
  stop: number | null;
  targetPct: number | null;
  stopPct: number | null;
  estimatedRoundTripCostPct: number;
  execution: ExecutionLevels | null;
}

export interface BuildExecutableSignalInput {
  ativo: string;
  timeframe: Timeframe;
  dataAsOf: Date;
  decision: DecisionResult;
  entryPrice: number;
  atr: number | null | undefined;
  roundTripCostPct?: number;
}

export const ESTIMATED_ROUND_TRIP_COST_PCT =
  2 * (FEE_PCT + SLIPPAGE_PCT);

function blocked(
  input: BuildExecutableSignalInput,
  reason: Exclude<ExecutableSignalReason, "ready">,
  execution: ExecutionLevels | null = null,
): ExecutableSignalTicket {
  return {
    version: EXECUTABLE_SIGNAL_VERSION,
    status: "not_executable",
    reason,
    ativo: input.ativo,
    timeframe: input.timeframe,
    dataAsOf: input.dataAsOf,
    side: null,
    positionSizePct: 0,
    entrada: null,
    alvo: null,
    stop: null,
    targetPct: execution?.targetPct ?? null,
    stopPct: execution?.stopPct ?? null,
    estimatedRoundTripCostPct: input.roundTripCostPct ?? ESTIMATED_ROUND_TRIP_COST_PCT,
    execution,
  };
}

export function buildExecutableSignal(
  input: BuildExecutableSignalInput,
): ExecutableSignalTicket {
  const { decision } = input;
  const roundTripCostPct = input.roundTripCostPct ?? ESTIMATED_ROUND_TRIP_COST_PCT;
  if (!Number.isFinite(roundTripCostPct) || roundTripCostPct < 0) {
    return blocked(input, "cost_filter");
  }

  if (decision.recomendacao === "WAIT") {
    return blocked(input, "wait_decision");
  }

  if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) {
    return blocked(input, "invalid_price");
  }

  const side = decision.recomendacao;
  const resolved = resolvePriceLevels({
    entryPrice: input.entryPrice,
    side,
    atr: input.atr,
    timeframe: input.timeframe,
    referencePrice: input.entryPrice,
  });

  if (resolved.execution.targetPct <= roundTripCostPct) {
    return blocked(input, "cost_filter", resolved.execution);
  }

  const riskReward = assessRiskReward(
    resolved.execution.targetPct,
    resolved.execution.stopPct,
    MIN_RISK_REWARD,
  );
  if (!riskReward.passed) {
    return blocked(input, "risk_reward_filter", resolved.execution);
  }

  return {
    version: EXECUTABLE_SIGNAL_VERSION,
    status: "ready",
    reason: "ready",
    ativo: input.ativo,
    timeframe: input.timeframe,
    dataAsOf: input.dataAsOf,
    side,
    positionSizePct: decision.tamanhoPosicaoPct,
    entrada: resolved.levels.entrada,
    alvo: resolved.levels.alvo,
    stop: resolved.levels.stop,
    targetPct: resolved.execution.targetPct,
    stopPct: resolved.execution.stopPct,
    estimatedRoundTripCostPct: roundTripCostPct,
    execution: resolved.execution,
  };
}
