export const JEV_MODEL_VERSION = process.env.JEV_MODEL_VERSION ?? "jev-1.13";

export interface DecisionThresholds {
  readonly minConfidence: number;
  readonly minProbabilidade: number;
  readonly bloquearSeRiscoElevado: boolean;
  readonly frozenAt: Date | null;
}

const values = {
  minConfidence: 0.65,
  minProbabilidade: 0.6,
  bloquearSeRiscoElevado: true,
  frozenAt: null as Date | null,
};

let frozen = false;

export const thresholds: DecisionThresholds = values;

export const FIXED_POSITION_PCT = 2.0;

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
