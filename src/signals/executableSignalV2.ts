import type { BuildExecutableSignalInput, ExecutableSignalTicket, ExecutableSignalReason } from "./executableSignal.js";
import {
  buildExecutableSignal,
  ESTIMATED_ROUND_TRIP_COST_PCT,
} from "./executableSignal.js";
import type { SignalConfluenceResult } from "./confluence.js";

export const CONFLUENT_EXECUTABLE_SIGNAL_VERSION = "hourly-signal-v2";

export type ConfluentExecutableSignalReason =
  | ExecutableSignalReason
  | "confluence_filter";

export interface ConfluentExecutableSignalTicket
  extends Omit<ExecutableSignalTicket, "version" | "reason"> {
  version: typeof CONFLUENT_EXECUTABLE_SIGNAL_VERSION;
  reason: ConfluentExecutableSignalReason;
  confluence: SignalConfluenceResult;
}

function blockedByConfluence(
  input: BuildExecutableSignalInput,
  confluence: SignalConfluenceResult,
): ConfluentExecutableSignalTicket {
  return {
    version: CONFLUENT_EXECUTABLE_SIGNAL_VERSION,
    status: "not_executable",
    reason: "confluence_filter",
    ativo: input.ativo,
    timeframe: input.timeframe,
    dataAsOf: input.dataAsOf,
    side: null,
    positionSizePct: 0,
    entrada: null,
    alvo: null,
    stop: null,
    targetPct: null,
    stopPct: null,
    estimatedRoundTripCostPct:
      input.roundTripCostPct ?? ESTIMATED_ROUND_TRIP_COST_PCT,
    execution: null,
    confluence,
  };
}

/**
 * V2 executable-signal path:
 * decision -> multi-timeframe confluence -> v1 execution/RR/cost gates.
 *
 * Confluence is checked first so a contradictory higher timeframe can veto the
 * signal before execution levels are considered.
 */
export function buildConfluentExecutableSignal(input: {
  signal: BuildExecutableSignalInput;
  confluence: SignalConfluenceResult;
}): ConfluentExecutableSignalTicket {
  if (input.confluence.status !== "aligned") {
    return blockedByConfluence(input.signal, input.confluence);
  }

  const base = buildExecutableSignal(input.signal);
  return {
    ...base,
    version: CONFLUENT_EXECUTABLE_SIGNAL_VERSION,
    confluence: input.confluence,
  };
}
