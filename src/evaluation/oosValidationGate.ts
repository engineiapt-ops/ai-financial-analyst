import { createHash } from "node:crypto";
import type { OosValidationReport } from "./oosValidationReport.js";
import type { OosRobustnessReport } from "./oosRobustness.js";
import {
  MIN_VALIDATION_CANDLES,
  OOS_EVALUATION_POLICY_VERSION,
} from "./oosPolicy.js";

export const OOS_VALIDATION_GATE_VERSION = "oos-validation-gate.v1";
export const MIN_GATE_FOLDS = 5;
export const MIN_GATE_CLOSED_TRADES = 30;

export type ValidationGateStrategy =
  | "baseline"
  | "baseline_risk"
  | "jev";

export interface ValidationGateCheck {
  key: string;
  passed: boolean;
  blocking: boolean;
  message: string;
}

export interface OosValidationGate {
  gateVersion: typeof OOS_VALIDATION_GATE_VERSION;
  status: "ready" | "blocked";
  strategy: ValidationGateStrategy;
  generatedAt: string;
  scope: {
    backtestRunId: number;
    walkForwardRunId: number | null;
    ativo: string;
    timeframe: "1h" | "4h" | "1d";
    validationFrom: string;
    validationTo: string;
  };
  checks: ValidationGateCheck[];
  blockingReasons: string[];
  advisories: string[];
  evidenceHash: string;
  interpretation: {
    readyMeans: string;
    notAnInvestmentVerdict: true;
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return item;
  });
}

function hashEvidence(input: {
  gateVersion: string;
  strategy: ValidationGateStrategy;
  validationReport: OosValidationReport;
  robustnessReport: OosRobustnessReport;
  checks: ValidationGateCheck[];
}): string {
  const stableValidation = {
    ...input.validationReport,
    generatedAt: undefined,
  };
  const stableRobustness = {
    ...input.robustnessReport,
    generatedAt: undefined,
  };

  return createHash("sha256")
    .update(canonicalJson({
      gateVersion: input.gateVersion,
      strategy: input.strategy,
      validation: stableValidation,
      robustness: stableRobustness,
      checks: input.checks,
    }))
    .digest("hex");
}

function getStrategyRobustness(
  report: OosRobustnessReport,
  strategy: ValidationGateStrategy,
) {
  return report.strategies.find((item) => item.estrategia === strategy) ?? null;
}

export function buildOosValidationGate(input: {
  strategy: ValidationGateStrategy;
  validationReport: OosValidationReport;
  robustnessReport: OosRobustnessReport;
  generatedAt?: Date;
}): OosValidationGate {
  const { validationReport, robustnessReport, strategy } = input;
  const checks: ValidationGateCheck[] = [];

  const addCheck = (
    key: string,
    passed: boolean,
    blocking: boolean,
    message: string,
  ) => {
    checks.push({ key, passed, blocking, message });
  };

  const calibrationEnd = new Date(validationReport.scope.calibrationEnd);
  const validationFrom = new Date(validationReport.scope.validationFrom);
  const validationTo = new Date(validationReport.scope.validationTo);

  addCheck(
    "oos-mode",
    validationReport.scope.backtestRunId > 0,
    true,
    "A validação está associada a um backtest OOS identificável.",
  );

  addCheck(
    "policy-version",
    validationReport.scope.policyVersion === OOS_EVALUATION_POLICY_VERSION,
    true,
    validationReport.scope.policyVersion === OOS_EVALUATION_POLICY_VERSION
      ? `A política OOS ${OOS_EVALUATION_POLICY_VERSION} está registrada.`
      : `A política registrada é ${validationReport.scope.policyVersion ?? "ausente"}.`,
  );

  const boundariesValid =
    validationFrom.getTime() > calibrationEnd.getTime() &&
    validationTo.getTime() > validationFrom.getTime();

  addCheck(
    "boundary-order",
    boundariesValid,
    true,
    boundariesValid
      ? "As fronteiras de calibração e validação estão em ordem estrita."
      : "As fronteiras de calibração e validação são inválidas.",
  );

  const validationCandleCount =
    validationReport.scope.candlesTotal !== null &&
    validationReport.scope.oosStartRatio !== null
      ? validationReport.scope.candlesTotal -
        Math.floor(
          validationReport.scope.candlesTotal *
            validationReport.scope.oosStartRatio,
        )
      : null;

  const minimumValidationCheck =
    validationCandleCount !== null &&
    validationCandleCount >= MIN_VALIDATION_CANDLES &&
    validationReport.scope.datasetHash !== null;

  addCheck(
    "validation-scope",
    minimumValidationCheck,
    true,
    minimumValidationCheck
      ? `${validationCandleCount} candles na janela de validação; mínimo formal da política: ${MIN_VALIDATION_CANDLES}.`
      : validationCandleCount !== null
        ? `A janela de validação possui ${validationCandleCount} candles; mínimo formal: ${MIN_VALIDATION_CANDLES}.`
        : "O relatório não contém metadados suficientes para auditar a janela de validação.",
  );

  const datasetMatch =
    validationReport.scope.datasetHash !== null &&
    robustnessReport.scope.datasetHash !== null &&
    validationReport.scope.walkForwardDatasetHash !== null &&
    robustnessReport.scope.walkForwardDatasetHash !== null &&
    validationReport.scope.datasetHash === robustnessReport.scope.datasetHash &&
    validationReport.scope.walkForwardDatasetHash === robustnessReport.scope.walkForwardDatasetHash &&
    validationReport.scope.datasetHash === validationReport.scope.walkForwardDatasetHash;

  addCheck(
    "dataset-integrity",
    datasetMatch,
    true,
    datasetMatch
      ? "Backtest OOS e walk-forward usam o mesmo dataset hash."
      : "Os hashes do backtest OOS e do walk-forward não estão alinhados.",
  );

  const robustnessScopeMatch =
    robustnessReport.scope.backtestRunId === validationReport.scope.backtestRunId &&
    robustnessReport.scope.ativo === validationReport.scope.ativo &&
    robustnessReport.scope.timeframe === validationReport.scope.timeframe &&
    new Date(robustnessReport.scope.validationFrom).getTime() === validationFrom.getTime() &&
    new Date(robustnessReport.scope.validationTo).getTime() === validationTo.getTime();

  addCheck(
    "report-scope",
    robustnessScopeMatch,
    true,
    robustnessScopeMatch
      ? "Relatório de validação e robustez usam o mesmo escopo OOS."
      : "Os relatórios de validação e robustez estão em escopos diferentes.",
  );

  const strategyRobustness = getStrategyRobustness(robustnessReport, strategy);
  const usableFolds = strategyRobustness?.usableFolds ?? 0;
  const closedTrades = strategyRobustness?.totalClosedTrades ?? 0;

  addCheck(
    "minimum-folds",
    usableFolds >= MIN_GATE_FOLDS,
    true,
    usableFolds >= MIN_GATE_FOLDS
      ? `${usableFolds} folds utilizáveis para ${strategy}.`
      : `A estratégia ${strategy} tem apenas ${usableFolds} folds utilizáveis; mínimo técnico: ${MIN_GATE_FOLDS}.`,
  );

  addCheck(
    "minimum-closed-trades",
    closedTrades >= MIN_GATE_CLOSED_TRADES,
    true,
    closedTrades >= MIN_GATE_CLOSED_TRADES
      ? `${closedTrades} trades fechados para ${strategy}.`
      : `A estratégia ${strategy} tem apenas ${closedTrades} trades fechados; mínimo técnico: ${MIN_GATE_CLOSED_TRADES}.`,
  );

  addCheck(
    "calibration-sample",
    validationReport.calibration.sufficientSample,
    true,
    validationReport.calibration.sufficientSample
      ? `A calibração possui ${validationReport.calibration.sampleCount} observações.`
      : `A calibração possui ${validationReport.calibration.sampleCount} observações; mínimo recomendado: ${validationReport.calibration.minimumRecommendedSample}.`,
  );

  const integrityWarnings = [
    ...validationReport.warnings,
    ...robustnessReport.warnings,
  ].filter(
    (warning) =>
      warning.includes("hashes") ||
      warning.includes("do not match") ||
      warning.includes("No walk-forward") ||
      warning.includes("No usable walk-forward") ||
      warning.includes("coverage") ||
      warning.includes("scopes do not match") ||
      warning.includes("scope"),
  );

  addCheck(
    "no-integrity-warnings",
    integrityWarnings.length === 0,
    true,
    integrityWarnings.length === 0
      ? "Não há alertas de integridade entre as evidências agregadas."
      : integrityWarnings.join(" "),
  );

  const advisories = [
    ...validationReport.warnings,
    ...robustnessReport.warnings,
  ].filter((warning) => !integrityWarnings.includes(warning));

  const generatedAt = input.generatedAt ?? new Date();
  const blockingReasons = checks
    .filter((check) => check.blocking && !check.passed)
    .map((check) => check.message);

  const status = blockingReasons.length === 0 ? "ready" : "blocked";

  const gate: OosValidationGate = {
    gateVersion: OOS_VALIDATION_GATE_VERSION,
    status,
    strategy,
    generatedAt: generatedAt.toISOString(),
    scope: {
      backtestRunId: validationReport.scope.backtestRunId,
      walkForwardRunId: validationReport.scope.walkForwardRunId,
      ativo: validationReport.scope.ativo,
      timeframe: validationReport.scope.timeframe,
      validationFrom: validationFrom.toISOString(),
      validationTo: validationTo.toISOString(),
    },
    checks,
    blockingReasons,
    advisories,
    evidenceHash: "",
    interpretation: {
      readyMeans:
        "A evidência técnica está íntegra e possui amostra mínima para avançar para a próxima camada de engenharia. Isso não representa uma previsão ou garantia de resultado financeiro.",
      notAnInvestmentVerdict: true,
    },
  };

  gate.evidenceHash = hashEvidence({
    gateVersion: OOS_VALIDATION_GATE_VERSION,
    strategy,
    validationReport,
    robustnessReport,
    checks,
  });

  return gate;
}
