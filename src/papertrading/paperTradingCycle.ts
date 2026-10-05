import type { ExecutionModelV3Config, CfdQuoteCandle } from "./executionModelV3.js";
import { validatePaperSignal } from "./paperValidation.js";
import {
  buildConfluentExecutableSignal,
  type ConfluentExecutableSignalTicket,
} from "../signals/executableSignalV2.js";
import {
  evaluateSignalConfluence,
  type MultiTimeframeContext,
  type SignalConfluenceResult,
} from "../signals/confluence.js";
import {
  applyRiskToDecision,
  evaluateRiskV2,
  type RiskAssessment,
  type RiskPolicy,
  type RiskState,
} from "../risk/riskEngine.js";
import type { DecisionResult } from "../types.js";

export const PAPER_TRADING_CYCLE_VERSION = "paper-trading-cycle.v1";

export type PaperTradingCycleStage =
  | "confluence"
  | "executable_signal"
  | "risk"
  | "paper_validation";

export type PaperTradingCycleStatus = "validated" | "blocked";

export interface PaperTradingCycleResult {
  version: typeof PAPER_TRADING_CYCLE_VERSION;
  status: PaperTradingCycleStatus;
  stage: PaperTradingCycleStage;
  reason: string;
  confluence: SignalConfluenceResult;
  candidateSignal: ConfluentExecutableSignalTicket | null;
  finalSignal: ConfluentExecutableSignalTicket | null;
  risk: RiskAssessment | null;
  paper: ReturnType<typeof validatePaperSignal> | null;
}

/**
 * End-to-end paper-only orchestration:
 *
 * decision
 *   -> multi-timeframe confluence
 *   -> executable signal (R/R + cost gates)
 *   -> risk engine v2 (hard caps + portfolio exposure)
 *   -> paper execution validation
 *
 * There is intentionally no broker/order dependency in this module.
 */
export function runPaperTradingCycle(input: {
  decision: DecisionResult;
  context: MultiTimeframeContext;
  signalCandle: CfdQuoteCandle;
  futureCandles: CfdQuoteCandle[];
  executionConfig: ExecutionModelV3Config;
  riskState: RiskState;
  riskPolicy?: Partial<RiskPolicy>;
  requiredTimeframes?: MultiTimeframeContext extends never ? never : readonly ("1h" | "4h" | "1d")[];
}): PaperTradingCycleResult {
  const requiredTimeframes = input.requiredTimeframes;
  if (requiredTimeframes && requiredTimeframes.length === 0) {
    throw new Error("requiredTimeframes must not be empty");
  }

  if (!Number.isFinite(input.signalCandle.close) || input.signalCandle.close <= 0) {
    throw new Error("signalCandle.close must be a positive finite number");
  }

  if (!Array.isArray(input.futureCandles)) {
    throw new Error("futureCandles must be an array");
  }

  try {
    const confluence = evaluateSignalConfluence({
      decision: input.decision,
      context: input.context,
      requiredTimeframes,
    });

    if (confluence.status !== "aligned") {
      return {
        version: PAPER_TRADING_CYCLE_VERSION,
        status: "blocked",
        stage: "confluence",
        reason: confluence.reason,
        confluence,
        candidateSignal: null,
        finalSignal: null,
        risk: null,
        paper: null,
      };
    }

    const atr =
      input.signalCandle.close > 0
        ? Math.abs(input.signalCandle.high - input.signalCandle.low) / 2
        : null;

    if (atr === null || !Number.isFinite(atr) || atr <= 0) {
      throw new Error("Unable to derive a valid execution ATR from signal candle");
    }

    const candidateSignal = buildConfluentExecutableSignal({
      signal: {
        ativo: "paper-cycle",
        timeframe: input.requiredTimeframes?.[0] ?? "1h",
        dataAsOf: input.signalCandle.closeTime ?? input.signalCandle.openTime,
        decision: input.decision,
        entryPrice: input.signalCandle.close,
        atr,
      },
      confluence,
    });

    if (candidateSignal.status !== "ready" || candidateSignal.stopPct === null) {
      return {
        version: PAPER_TRADING_CYCLE_VERSION,
        status: "blocked",
        stage: "executable_signal",
        reason: candidateSignal.reason,
        confluence,
        candidateSignal,
        finalSignal: null,
        risk: null,
        paper: null,
      };
    }

    const signalTimeframe = candidateSignal.timeframe;
    const regime = input.context.regime[signalTimeframe];
    if (!regime) {
      return {
        version: PAPER_TRADING_CYCLE_VERSION,
        status: "blocked",
        stage: "risk",
        reason: "missing_signal_timeframe_regime",
        confluence,
        candidateSignal,
        finalSignal: null,
        risk: null,
        paper: null,
      };
    }

    const risk = evaluateRiskV2({
      decision: input.decision,
      regime,
      state: input.riskState,
      stopDistancePct: candidateSignal.stopPct * 100,
      policy: input.riskPolicy,
    });

    if (!risk.allowed) {
      return {
        version: PAPER_TRADING_CYCLE_VERSION,
        status: "blocked",
        stage: "risk",
        reason: risk.reason,
        confluence,
        candidateSignal,
        finalSignal: null,
        risk,
        paper: null,
      };
    }

    const riskAdjustedDecision = applyRiskToDecision(input.decision, risk);
    const finalSignal = buildConfluentExecutableSignal({
      signal: {
        ativo: candidateSignal.ativo,
        timeframe: candidateSignal.timeframe,
        dataAsOf: candidateSignal.dataAsOf,
        decision: riskAdjustedDecision,
        entryPrice: candidateSignal.entrada ?? input.signalCandle.close,
        atr,
      },
      confluence,
    });

    if (finalSignal.status !== "ready") {
      return {
        version: PAPER_TRADING_CYCLE_VERSION,
        status: "blocked",
        stage: "executable_signal",
        reason: finalSignal.reason,
        confluence,
        candidateSignal,
        finalSignal,
        risk,
        paper: null,
      };
    }

    const paper = validatePaperSignal({
      signal: {
        ...finalSignal,
        version: finalSignal.version,
      } as never,
      signalCandle: input.signalCandle,
      futureCandles: input.futureCandles,
      executionConfig: input.executionConfig,
      maxRiskPerTradePct: risk.riskPerTradePct,
    });

    if (paper.status !== "validated") {
      return {
        version: PAPER_TRADING_CYCLE_VERSION,
        status: "blocked",
        stage: "paper_validation",
        reason: paper.reason,
        confluence,
        candidateSignal,
        finalSignal,
        risk,
        paper,
      };
    }

    return {
      version: PAPER_TRADING_CYCLE_VERSION,
      status: "validated",
      stage: "paper_validation",
      reason: "validated",
      confluence,
      candidateSignal,
      finalSignal,
      risk,
      paper,
    };
  } catch (error) {
    // Keep pure orchestration fail-closed: invalid state must never become a
    // paper-approved result by accident. Re-throw programming/configuration
    // errors so CI and callers can surface the exact root cause.
    if (error instanceof Error) {
      throw new Error(`Paper trading cycle failed: ${error.message}`, {
        cause: error,
      });
    }
    throw new Error("Paper trading cycle failed: unknown error");
  }
}
