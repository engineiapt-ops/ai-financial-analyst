export const JEV_MODEL_VERSION = process.env.JEV_MODEL_VERSION?.trim() || undefined;

export function envNumber(
  name: string,
  fallback: number,
  range?: { min?: number; max?: number },
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a finite number`);
  }
  if (range?.min !== undefined && n < range.min) {
    throw new Error(`${name} must be greater than or equal to ${range.min}`);
  }
  if (range?.max !== undefined && n > range.max) {
    throw new Error(`${name} must be less than or equal to ${range.max}`);
  }

  return n;
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

const values = {
  minConfidence: envNumber("DECISION_MIN_CONFIDENCE", 0.68, { min: 0, max: 1 }),
  minProbabilidade: envNumber("DECISION_MIN_PROBABILIDADE", 0.62, { min: 0, max: 1 }),
  bloquearSeRiscoElevado: envBool("DECISION_BLOQUEAR_RISCO_ELEVADO", true),
  frozenAt: null as Date | null,
};

let frozen = false;
export const thresholds: DecisionThresholds = values;
export const FIXED_POSITION_PCT = envNumber("FIXED_POSITION_PCT", 1.5, { min: 0, max: 100 });

export function freezeThresholds(): void {
  if (!frozen) {
    values.frozenAt = new Date();
    frozen = true;
    Object.freeze(values);
  }
}

export function assertFrozenForOOS(mode: "dev" | "oos"): void {
  if (mode === "oos" && !frozen) {
    throw new Error("Thresholds não congelados: chame freezeThresholds() antes de rodar validação OOS.");
  }
}

export function areThresholdsFrozen(): boolean {
  return frozen;
}

export function thresholdsSnapshot(): Record<string, unknown> {
  return {
    minConfidence: values.minConfidence,
    minProbabilidade: values.minProbabilidade,
    bloquearSeRiscoElevado: values.bloquearSeRiscoElevado,
    fixedPositionPct: FIXED_POSITION_PCT,
    jevModelVersion: JEV_MODEL_VERSION,
    frozen,
    frozenAt: values.frozenAt?.toISOString() ?? null,
  };
}
