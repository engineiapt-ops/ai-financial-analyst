export const JEV_MODEL_VERSION = process.env.JEV_MODEL_VERSION ?? "jev-1.13";

export interface DecisionThresholds {
  minConfidence: number;
  minProbabilidade: number;
  bloquearSeRiscoElevado: boolean;
  frozenAt: Date | null;
}

export const thresholds: DecisionThresholds = {
  minConfidence: 0.65,
  minProbabilidade: 0.6,
  bloquearSeRiscoElevado: true,
  frozenAt: null,
};

export const FIXED_POSITION_PCT = 2.0;

export function freezeThresholds(): void {
  thresholds.frozenAt = new Date();
}

export function assertFrozenForOOS(mode: "dev" | "oos"): void {
  if (mode === "oos" && thresholds.frozenAt === null) {
    throw new Error("Thresholds não congelados: chame freezeThresholds() antes de rodar validação OOS.");
  }
}
