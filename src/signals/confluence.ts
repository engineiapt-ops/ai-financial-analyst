import type { Timeframe } from "../types.js";
import type { DecisionResult } from "../types.js";
import type { PriceActionBias, PriceActionSnapshot } from "../quant/priceAction.js";
import type { RegimeSnapshot, RegimeTrend } from "../risk/regime.js";

export const SIGNAL_CONFLUENCE_VERSION = "signal-confluence-v1";

export interface MultiTimeframeContext {
  priceAction: Partial<Record<Timeframe, PriceActionSnapshot>>;
  regime: Partial<Record<Timeframe, RegimeSnapshot>>;
}

export interface SignalConfluenceResult {
  version: typeof SIGNAL_CONFLUENCE_VERSION;
  status: "aligned" | "blocked";
  side: "BUY" | "SELL" | null;
  requiredTimeframes: readonly Timeframe[];
  evaluatedTimeframes: number;
  directionalObservations: number;
  alignedObservations: number;
  alignmentScore: number;
  reason:
    | "aligned"
    | "wait_decision"
    | "missing_timeframe_data"
    | "higher_timeframe_contradiction"
    | "insufficient_alignment";
  details: string[];
}

const DEFAULT_TIMEFRAMES: readonly Timeframe[] = ["1h", "4h", "1d"];

function directionalMatch(
  side: "BUY" | "SELL",
  bias: PriceActionBias,
): boolean {
  return side === "BUY" ? bias === "BULLISH" : bias === "BEARISH";
}

function trendContradicts(
  side: "BUY" | "SELL",
  trend: RegimeTrend,
): boolean {
  return side === "BUY" ? trend === "BEARISH" : trend === "BULLISH";
}

function sideFromDecision(decision: DecisionResult): "BUY" | "SELL" | null {
  return decision.recomendacao === "BUY" || decision.recomendacao === "SELL"
    ? decision.recomendacao
    : null;
}

/**
 * Multi-timeframe confluence gate.
 *
 * The gate is intentionally fail-closed:
 * - WAIT decisions never become executable.
 * - Missing any required timeframe blocks the confluence result.
 * - A contradictory higher-timeframe trend blocks the result.
 * - At least 75% of available directional observations must align.
 */
export function evaluateSignalConfluence(input: {
  decision: DecisionResult;
  context: MultiTimeframeContext;
  requiredTimeframes?: readonly Timeframe[];
}): SignalConfluenceResult {
  const requiredTimeframes = input.requiredTimeframes ?? DEFAULT_TIMEFRAMES;
  const side = sideFromDecision(input.decision);

  if (!requiredTimeframes.length) {
    throw new Error("requiredTimeframes must not be empty");
  }

  if (!side) {
    return {
      version: SIGNAL_CONFLUENCE_VERSION,
      status: "blocked",
      side: null,
      requiredTimeframes,
      evaluatedTimeframes: 0,
      directionalObservations: 0,
      alignedObservations: 0,
      alignmentScore: 0,
      reason: "wait_decision",
      details: ["decision=WAIT"],
    };
  }

  const details: string[] = [];
  let evaluatedTimeframes = 0;
  let directionalObservations = 0;
  let alignedObservations = 0;

  for (const timeframe of requiredTimeframes) {
    const priceAction = input.context.priceAction[timeframe];
    const regime = input.context.regime[timeframe];

    if (!priceAction || !regime) {
      details.push(`${timeframe}=missing_data`);
      continue;
    }

    evaluatedTimeframes += 1;

    const paAligned = directionalMatch(side, priceAction.bias);
    const regimeAligned = !trendContradicts(side, regime.trend);

    directionalObservations += 2;
    if (paAligned) alignedObservations += 1;
    if (regimeAligned && regime.trend !== "SIDEWAYS") alignedObservations += 1;

    details.push(
      `${timeframe}=priceAction:${priceAction.bias} regime:${regime.trend}`,
    );

    if (
      (timeframe === "4h" || timeframe === "1d") &&
      trendContradicts(side, regime.trend)
    ) {
      return {
        version: SIGNAL_CONFLUENCE_VERSION,
        status: "blocked",
        side,
        requiredTimeframes,
        evaluatedTimeframes,
        directionalObservations,
        alignedObservations,
        alignmentScore:
          directionalObservations > 0
            ? alignedObservations / directionalObservations
            : 0,
        reason: "higher_timeframe_contradiction",
        details: [...details, `${timeframe}=higher_timeframe_veto`],
      };
    }
  }

  if (evaluatedTimeframes !== requiredTimeframes.length) {
    return {
      version: SIGNAL_CONFLUENCE_VERSION,
      status: "blocked",
      side,
      requiredTimeframes,
      evaluatedTimeframes,
      directionalObservations,
      alignedObservations,
      alignmentScore:
        directionalObservations > 0
          ? alignedObservations / directionalObservations
          : 0,
      reason: "missing_timeframe_data",
      details,
    };
  }

  const alignmentScore =
    directionalObservations > 0
      ? alignedObservations / directionalObservations
      : 0;

  if (alignmentScore < 0.75) {
    return {
      version: SIGNAL_CONFLUENCE_VERSION,
      status: "blocked",
      side,
      requiredTimeframes,
      evaluatedTimeframes,
      directionalObservations,
      alignedObservations,
      alignmentScore,
      reason: "insufficient_alignment",
      details,
    };
  }

  return {
    version: SIGNAL_CONFLUENCE_VERSION,
    status: "aligned",
    side,
    requiredTimeframes,
    evaluatedTimeframes,
    directionalObservations,
    alignedObservations,
    alignmentScore,
    reason: "aligned",
    details,
  };
}
