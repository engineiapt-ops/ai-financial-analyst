/**
 * Níveis de execução (target / stop) por timeframe e ATR.
 *
 * Objetivo: alinhar o paper trading à volatilidade real de cada timeframe
 * em vez de percentuais fixos iguais para 1h, 4h e 1D.
 *
 * Multiplicadores conservadores para uso pessoal (paper → real).
 * Fallback para percentuais fixos quando ATR não está disponível.
 */

import type { Timeframe } from "../types.js";

export const EXECUTION_LEVELS_VERSION = "execution-levels-v1";

/** Fallback quando ATR é nulo ou inválido. */
export const FALLBACK_TARGET_PCT = 0.01; // 1%
export const FALLBACK_STOP_PCT = 0.005; // 0.5%

export interface AtrMultipliers {
  /** Target = ATR * targetMult / price  →  percentual */
  readonly targetMult: number;
  /** Stop   = ATR * stopMult / price */
  readonly stopMult: number;
  /** Teto máximo de target (proteção) */
  readonly maxTargetPct: number;
  /** Piso mínimo de stop (proteção) */
  readonly minStopPct: number;
  /** Teto máximo de stop */
  readonly maxStopPct: number;
}

/**
 * Multiplicadores por timeframe.
 * 1h: mais apertado | 4h: médio | 1d: mais largo
 */
export const ATR_MULTIPLIERS: Record<Timeframe, AtrMultipliers> = {
  "1h": {
    targetMult: 1.25,
    stopMult: 1.0,
    maxTargetPct: 0.025,
    minStopPct: 0.003,
    maxStopPct: 0.015,
  },
  "4h": {
    targetMult: 1.5,
    stopMult: 1.1,
    maxTargetPct: 0.04,
    minStopPct: 0.005,
    maxStopPct: 0.025,
  },
  "1d": {
    targetMult: 1.75,
    stopMult: 1.25,
    maxTargetPct: 0.06,
    minStopPct: 0.008,
    maxStopPct: 0.04,
  },
};

export interface ExecutionLevels {
  version: typeof EXECUTION_LEVELS_VERSION;
  targetPct: number;
  stopPct: number;
  source: "atr" | "fallback";
  atrRelative: number | null;
}

/**
 * Calcula target% e stop% a partir do ATR e do timeframe.
 * Sempre retorna valores finitos e positivos.
 */
export function resolveExecutionLevels(input: {
  price: number;
  atr: number | null | undefined;
  timeframe: Timeframe;
}): ExecutionLevels {
  const { price, atr, timeframe } = input;
  const mult = ATR_MULTIPLIERS[timeframe] ?? ATR_MULTIPLIERS["1h"];

  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    atr == null ||
    !Number.isFinite(atr) ||
    atr <= 0
  ) {
    return {
      version: EXECUTION_LEVELS_VERSION,
      targetPct: FALLBACK_TARGET_PCT,
      stopPct: FALLBACK_STOP_PCT,
      source: "fallback",
      atrRelative: null,
    };
  }

  const atrRelative = atr / price;
  let targetPct = (atr * mult.targetMult) / price;
  let stopPct = (atr * mult.stopMult) / price;

  targetPct = Math.min(targetPct, mult.maxTargetPct);
  stopPct = Math.min(Math.max(stopPct, mult.minStopPct), mult.maxStopPct);

  // Garante reward/risk mínimo ~1:1
  if (targetPct < stopPct) {
    targetPct = Math.min(stopPct * 1.15, mult.maxTargetPct);
  }

  return {
    version: EXECUTION_LEVELS_VERSION,
    targetPct,
    stopPct,
    source: "atr",
    atrRelative,
  };
}

/**
 * Converte entry + target%/stop% em preços de alvo e stop.
 * Única forma recomendada de materializar níveis para persistência e simulação.
 */
export function priceLevelsFromPct(
  entryPrice: number,
  side: "BUY" | "SELL",
  targetPct: number,
  stopPct: number,
): { entrada: number; alvo: number; stop: number } {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new Error("entryPrice must be a positive finite number");
  }
  if (!Number.isFinite(targetPct) || targetPct <= 0) {
    throw new Error("targetPct must be > 0");
  }
  if (!Number.isFinite(stopPct) || stopPct <= 0) {
    throw new Error("stopPct must be > 0");
  }
  const direction = side === "BUY" ? 1 : -1;
  return {
    entrada: entryPrice,
    alvo: entryPrice * (1 + direction * targetPct),
    stop: entryPrice * (1 - direction * stopPct),
  };
}

/**
 * Resolve níveis de execução (ATR ou fallback) e materializa preços.
 * Fonte única para backtest / walk-forward / remote runners.
 */
export function resolvePriceLevels(input: {
  entryPrice: number,
  side: "BUY" | "SELL",
  atr: number | null | undefined,
  timeframe: Timeframe,
  referencePrice?: number,
}): {
  levels: { entrada: number; alvo: number; stop: number };
  execution: ExecutionLevels;
} {
  const referencePrice = input.referencePrice ?? input.entryPrice;
  const execution = resolveExecutionLevels({
    price: referencePrice,
    atr: input.atr ?? null,
    timeframe: input.timeframe,
  });
  return {
    execution,
    levels: priceLevelsFromPct(
      input.entryPrice,
      input.side,
      execution.targetPct,
      execution.stopPct,
    ),
  };
}
