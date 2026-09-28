/**
 * Thresholds de decisão — uso pessoal / paper trading.
 *
 * Regras de ouro:
 * 1. Congelar (freezeThresholds) ANTES de qualquer validação OOS ou walk-forward sério.
 * 2. Não alterar valores depois de congelar até ter base sólida de resultados.
 * 3. Preferir WAIT a forçar operação (mais seletivo = mais assertivo no longo prazo).
 *
 * Defaults um pouco mais conservadores para daytrade pessoal.
 * Podem ser sobrescritos via .env (ver .env.example).
 */

export const JEV_MODEL_VERSION = process.env.JEV_MODEL_VERSION ?? "gateway-managed";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export interface DecisionThresholds {
  readonly minConfidence: number;
  readonly minProbabilidade: number;
  readonly bloquearSeRiscoElevado: boolean;
  readonly frozenAt: Date | null;
}

/** Defaults conservadores para uso pessoal antes de dinheiro real. */
const values = {
  minConfidence: envNumber("DECISION_MIN_CONFIDENCE", 0.68),
  minProbabilidade: envNumber("DECISION_MIN_PROBABILIDADE", 0.62),
  bloquearSeRiscoElevado: envBool("DECISION_BLOQUEAR_RISCO_ELEVADO", true),
  frozenAt: null as Date | null,
};

let frozen = false;

export const thresholds: DecisionThresholds = values;

/**
 * Position sizing fixo e conservador (% do capital por operação).
 * 1.5% é mais seguro para paper → real do que 2%.
 * Sobrescreva com FIXED_POSITION_PCT no .env se quiser.
 */
export const FIXED_POSITION_PCT = envNumber("FIXED_POSITION_PCT", 1.5);

/**
 * Congela os thresholds. Deve ser chamado antes de OOS / walk-forward.
 * Depois de congelar, os valores não podem mais ser alterados em runtime.
 */
export function freezeThresholds(): void {
  if (!frozen) {
    values.frozenAt = new Date();
    frozen = true;
    Object.freeze(values);
  }
}

/**
 * Garante que thresholds estão congelados quando o modo é OOS.
 * Lança erro se tentar validar fora da amostra sem freeze.
 */
export function assertFrozenForOOS(mode: "dev" | "oos"): void {
  if (mode === "oos" && !frozen) {
    throw new Error(
      "Thresholds não congelados: chame freezeThresholds() antes de rodar validação OOS.",
    );
  }
}

export function areThresholdsFrozen(): boolean {
  return frozen;
}

/** Snapshot legível para logs e readiness (não expõe segredos). */
export function thresholdsSnapshot(): Record<string, unknown> {
  return {
    minConfidence: values.minConfidence,
    minProbabilidade: values.minProbabilidade,
    bloquearSeRiscoElevado: values.bloquearSeRiscoElevado,
    fixedPositionPct: FIXED_POSITION_PCT,
    jevModelVersion: JEV_MODEL_VERSION,
    frozen: frozen,
    frozenAt: values.frozenAt?.toISOString() ?? null,
  };
}
