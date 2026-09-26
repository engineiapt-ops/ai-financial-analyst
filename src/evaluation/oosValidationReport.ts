import type { BacktestRun, DecisionKpis } from "../db/repository.js";
import type { CalibrationReport } from "./calibration.js";
import { MIN_VALIDATION_CANDLES, OOS_EVALUATION_POLICY_VERSION } from "./oosPolicy.js";

export const OOS_VALIDATION_REPORT_VERSION = "oos-validation-report.v1";

export interface OosWalkForwardRun {
  id: number;
  ativo: string;
  timeframe: "1h" | "4h" | "1d";
  datasetStart: Date;
  datasetEnd: Date;
  candlesTotal: number;
  datasetHash: string;
  initialTrainCandles: number;
  testCandles: number;
  stepCandles: number;
  lookaheadCandles: number;
  executionModelVersion: string;
  targetPct: number;
  stopPct: number;
  slippagePct: number;
  feePct: number;
}

export interface OosFoldRow {
  fold_number: number;
  train_start: Date;
  train_end: Date;
  test_start: Date;
  test_end: Date;
  estrategia: "baseline" | "buyhold" | "jev";
  status: "ok" | "unavailable" | "error";
  test_signals: number;
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  win_rate: number | null;
  profit_factor: number | null;
  total_profit_percent: number;
  avg_profit_percent: number;
  expectancy_percent: number;
  max_drawdown_percent: number;
  gross_total_profit_percent: number;
  total_fee_percent: number;
  total_slippage_percent: number;
  avg_candles_held: number | null;
  notas: string | null;
}

export interface OosStrategyStability {
  folds: number;
  usableFolds: number;
  profitableFolds: number;
  profitableFoldRatePct: number | null;
  meanFoldReturnPct: number | null;
  medianFoldReturnPct: number | null;
  returnStdDevPct: number | null;
  bestFoldReturnPct: number | null;
  worstFoldReturnPct: number | null;
  meanWinRatePct: number | null;
  meanMaxDrawdownPct: number | null;
  worstMaxDrawdownPct: number | null;
  totalClosedTrades: number;
}

export interface OosPerformanceSummary extends OosStrategyStability {
  estrategia: OosFoldRow["estrategia"];
  totalProfitPercent: number;
  grossTotalProfitPercent: number;
  totalFeePercent: number;
  totalSlippagePercent: number;
  avgProfitPercent: number;
  expectancyPercent: number;
}

export interface OosRiskSummary {
  baselineTrades: number;
  riskManagedTrades: number;
  estimatedBlockedTrades: number;
  estimatedBlockRatePct: number | null;
  baselineProfitPercent: number;
  riskManagedProfitPercent: number;
  profitDeltaPercent: number;
  baselineMaxDrawdownPercent: number;
  riskManagedMaxDrawdownPercent: number;
  maxDrawdownDeltaPercent: number;
  baselineMeanWinRatePct: number | null;
  riskManagedMeanWinRatePct: number | null;
  meanWinRateDeltaPp: number | null;
}

export interface OosScope {
  backtestRunId: number;
  walkForwardRunId: number | null;
  ativo: string;
  timeframe: "1h" | "4h" | "1d";
  validationFrom: string;
  validationTo: string;
  calibrationEnd: string;
  policyVersion: string | null;
  oosStartRatio: number | null;
  datasetHash: string | null;
  walkForwardDatasetHash: string | null;
}

export interface OosValidationReport {
  reportVersion: typeof OOS_VALIDATION_REPORT_VERSION;
  generatedAt: string;
  scope: OosScope;
  method: {
    policyVersionExpected: typeof OOS_EVALUATION_POLICY_VERSION;
    validationMinimumCandles: number;
    noAutomaticOptimization: true;
    notes: string[];
  };
  performance: OosPerformanceSummary[];
  risk: OosRiskSummary | null;
  stability: Record<string, OosStrategyStability>;
  calibration: CalibrationReport;
  decisionKpis: DecisionKpis;
  folds: OosFoldRow[];
  warnings: string[];
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  return values.length ? sum(values) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function standardDeviation(values: number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizeFold(row: OosFoldRow): OosFoldRow {
  return {
    ...row,
    fold_number: Number(row.fold_number),
    test_signals: Number(row.test_signals ?? 0),
    total_trades: Number(row.total_trades ?? 0),
    closed_trades: Number(row.closed_trades ?? 0),
    open_trades: Number(row.open_trades ?? 0),
    win_rate: finiteOrNull(row.win_rate),
    profit_factor: finiteOrNull(row.profit_factor),
    total_profit_percent: Number(row.total_profit_percent ?? 0),
    avg_profit_percent: Number(row.avg_profit_percent ?? 0),
    expectancy_percent: Number(row.expectancy_percent ?? 0),
    max_drawdown_percent: Number(row.max_drawdown_percent ?? 0),
    gross_total_profit_percent: Number(row.gross_total_profit_percent ?? 0),
    total_fee_percent: Number(row.total_fee_percent ?? 0),
    total_slippage_percent: Number(row.total_slippage_percent ?? 0),
    avg_candles_held: finiteOrNull(row.avg_candles_held),
    train_start: new Date(row.train_start),
    train_end: new Date(row.train_end),
    test_start: new Date(row.test_start),
    test_end: new Date(row.test_end),
  };
}

function buildStability(rows: OosFoldRow[]): OosStrategyStability {
  const usable = rows.filter(
    (row) => row.status === "ok" && Number.isFinite(row.total_profit_percent),
  );
  const returns = usable.map((row) => row.total_profit_percent);
  const winRates = usable
    .map((row) => row.win_rate)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const drawdowns = usable.map((row) => row.max_drawdown_percent);

  return {
    folds: rows.length,
    usableFolds: usable.length,
    profitableFolds: usable.filter((row) => row.total_profit_percent > 0).length,
    profitableFoldRatePct: usable.length
      ? (usable.filter((row) => row.total_profit_percent > 0).length / usable.length) * 100
      : null,
    meanFoldReturnPct: average(returns),
    medianFoldReturnPct: median(returns),
    returnStdDevPct: standardDeviation(returns),
    bestFoldReturnPct: returns.length ? Math.max(...returns) : null,
    worstFoldReturnPct: returns.length ? Math.min(...returns) : null,
    meanWinRatePct: average(winRates),
    meanMaxDrawdownPct: average(drawdowns),
    worstMaxDrawdownPct: drawdowns.length ? Math.max(...drawdowns) : null,
    totalClosedTrades: sum(usable.map((row) => row.closed_trades)),
  };
}

function buildPerformance(
  estrategia: OosFoldRow["estrategia"],
  rows: OosFoldRow[],
): OosPerformanceSummary {
  const stability = buildStability(rows);
  return {
    estrategia,
    ...stability,
    totalProfitPercent: sum(rows.map((row) => row.total_profit_percent)),
    grossTotalProfitPercent: sum(rows.map((row) => row.gross_total_profit_percent)),
    totalFeePercent: sum(rows.map((row) => row.total_fee_percent)),
    totalSlippagePercent: sum(rows.map((row) => row.total_slippage_percent)),
    avgProfitPercent: average(rows.map((row) => row.avg_profit_percent)) ?? 0,
    expectancyPercent: average(rows.map((row) => row.expectancy_percent)) ?? 0,
  };
}

function buildRiskSummary(folds: OosFoldRow[]): OosRiskSummary | null {
  const baseline = folds
    .filter((row) => row.estrategia === "baseline")
    .reduce((map, row) => map.set(row.fold_number, row), new Map<number, OosFoldRow>());
  const managed = folds
    .filter((row) => row.estrategia === "baseline_risk")
    .reduce((map, row) => map.set(row.fold_number, row), new Map<number, OosFoldRow>());

  const foldNumbers = [...baseline.keys()].filter((fold) => managed.has(fold));
  if (!foldNumbers.length) return null;

  const baselineRows = foldNumbers.map((fold) => baseline.get(fold)!);
  const managedRows = foldNumbers.map((fold) => managed.get(fold)!);
  const baselineTrades = sum(baselineRows.map((row) => row.total_trades));
  const managedTrades = sum(managedRows.map((row) => row.total_trades));
  const blocked = Math.max(0, baselineTrades - managedTrades);

  const baselineWinRates = baselineRows
    .map((row) => row.win_rate)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const managedWinRates = managedRows
    .map((row) => row.win_rate)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const baselineDrawdown = Math.max(...baselineRows.map((row) => row.max_drawdown_percent));
  const managedDrawdown = Math.max(...managedRows.map((row) => row.max_drawdown_percent));

  return {
    baselineTrades,
    riskManagedTrades: managedTrades,
    estimatedBlockedTrades: blocked,
    estimatedBlockRatePct: baselineTrades ? (blocked / baselineTrades) * 100 : null,
    baselineProfitPercent: sum(baselineRows.map((row) => row.total_profit_percent)),
    riskManagedProfitPercent: sum(managedRows.map((row) => row.total_profit_percent)),
    profitDeltaPercent:
      sum(managedRows.map((row) => row.total_profit_percent)) -
      sum(baselineRows.map((row) => row.total_profit_percent)),
    baselineMaxDrawdownPercent: baselineDrawdown,
    riskManagedMaxDrawdownPercent: managedDrawdown,
    maxDrawdownDeltaPercent: managedDrawdown - baselineDrawdown,
    baselineMeanWinRatePct: average(baselineWinRates),
    riskManagedMeanWinRatePct: average(managedWinRates),
    meanWinRateDeltaPp:
      baselineWinRates.length && managedWinRates.length
        ? (average(managedWinRates) ?? 0) - (average(baselineWinRates) ?? 0)
        : null,
  };
}

export function buildOosValidationReport(input: {
  backtestRun: Pick<
    BacktestRun,
    | "id"
    | "mode"
    | "ativo"
    | "timeframe"
    | "periodoInicio"
    | "periodoFim"
    | "oosStartRatio"
    | "calibrationEnd"
    | "validationStart"
    | "evaluationPolicyVersion"
    | "datasetHash"
    | "candlesTotal"
  >;
  walkForwardRun?: OosWalkForwardRun | null;
  folds?: OosFoldRow[];
  calibration: CalibrationReport;
  decisionKpis: DecisionKpis;
  generatedAt?: Date;
}): OosValidationReport {
  const {
    backtestRun,
    walkForwardRun = null,
    calibration,
    decisionKpis,
  } = input;

  if (backtestRun.mode !== "oos") {
    throw new Error("OOS validation report requires a backtest run in oos mode");
  }
  if (!backtestRun.validationStart || !backtestRun.calibrationEnd) {
    throw new Error("Backtest run is missing calibration/validation boundaries");
  }
  if (backtestRun.validationStart.getTime() <= backtestRun.calibrationEnd.getTime()) {
    throw new Error("Backtest run has invalid OOS boundary ordering");
  }

  const validationFrom = backtestRun.validationStart;
  const validationTo = backtestRun.periodoFim;
  const folds = (input.folds ?? []).map(normalizeFold);
  const warnings: string[] = [];

  if (backtestRun.evaluationPolicyVersion !== OOS_EVALUATION_POLICY_VERSION) {
    warnings.push(
      `Backtest evaluation policy is ${backtestRun.evaluationPolicyVersion ?? "missing"}, expected ${OOS_EVALUATION_POLICY_VERSION}.`,
    );
  }

  if (
    backtestRun.oosStartRatio !== null &&
    backtestRun.candlesTotal !== null &&
    backtestRun.candlesTotal * (1 - backtestRun.oosStartRatio) < MIN_VALIDATION_CANDLES
  ) {
    warnings.push(`Validation window is smaller than the minimum recommended ${MIN_VALIDATION_CANDLES} candles.`);
  }

  if (!calibration.sufficientSample) {
    warnings.push(
      `Calibration sample has ${calibration.sampleCount} observations; recommended minimum is ${calibration.minimumRecommendedSample}.`,
    );
  }

  if (!walkForwardRun || !folds.length) {
    warnings.push("No walk-forward fold dataset was attached to this report; fold-level stability is unavailable.");
  } else {
    if (walkForwardRun.ativo !== backtestRun.ativo || walkForwardRun.timeframe !== backtestRun.timeframe) {
      warnings.push("Backtest and walk-forward asset/timeframe scopes do not match.");
    }
    if (backtestRun.datasetHash && walkForwardRun.datasetHash && backtestRun.datasetHash !== walkForwardRun.datasetHash) {
      warnings.push("Backtest and walk-forward dataset hashes do not match.");
    }

    const foldValidationStart = folds.reduce(
      (min, row) => row.test_start < min ? row.test_start : min,
      folds[0].test_start,
    );
    const foldValidationEnd = folds.reduce(
      (max, row) => row.test_end > max ? row.test_end : max,
      folds[0].test_end,
    );

    if (foldValidationStart.getTime() > validationFrom.getTime() || foldValidationEnd.getTime() < validationTo.getTime()) {
      warnings.push("Walk-forward fold coverage does not fully cover the backtest validation period.");
    }
  }

  const byStrategy = new Map<OosFoldRow["estrategia"], OosFoldRow[]>();
  for (const row of folds) {
    const current = byStrategy.get(row.estrategia) ?? [];
    current.push(row);
    byStrategy.set(row.estrategia, current);
  }

  const performance = [...byStrategy.entries()].map(([estrategia, rows]) =>
    buildPerformance(estrategia, rows),
  );
  const risk = buildRiskSummary(folds);

  const stability = Object.fromEntries(
    performance.map((summary) => [
      summary.estrategia,
      {
        folds: summary.folds,
        usableFolds: summary.usableFolds,
        profitableFolds: summary.profitableFolds,
        profitableFoldRatePct: summary.profitableFoldRatePct,
        meanFoldReturnPct: summary.meanFoldReturnPct,
        medianFoldReturnPct: summary.medianFoldReturnPct,
        returnStdDevPct: summary.returnStdDevPct,
        bestFoldReturnPct: summary.bestFoldReturnPct,
        worstFoldReturnPct: summary.worstFoldReturnPct,
        meanWinRatePct: summary.meanWinRatePct,
        meanMaxDrawdownPct: summary.meanMaxDrawdownPct,
        worstMaxDrawdownPct: summary.worstMaxDrawdownPct,
        totalClosedTrades: summary.totalClosedTrades,
      },
    ]),
  );

  return {
    reportVersion: OOS_VALIDATION_REPORT_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    scope: {
      backtestRunId: backtestRun.id,
      walkForwardRunId: walkForwardRun?.id ?? null,
      ativo: backtestRun.ativo,
      timeframe: backtestRun.timeframe,
      validationFrom: validationFrom.toISOString(),
      validationTo: validationTo.toISOString(),
      calibrationEnd: backtestRun.calibrationEnd.toISOString(),
      policyVersion: backtestRun.evaluationPolicyVersion,
      oosStartRatio: backtestRun.oosStartRatio,
      datasetHash: backtestRun.datasetHash,
      walkForwardDatasetHash: walkForwardRun?.datasetHash ?? null,
    },
    method: {
      policyVersionExpected: OOS_EVALUATION_POLICY_VERSION,
      validationMinimumCandles: MIN_VALIDATION_CANDLES,
      noAutomaticOptimization: true,
      notes: [
        "Performance and stability are aggregated from persisted walk-forward folds.",
        "Calibration and decision KPIs are scoped to the backtest validation period and asset/timeframe.",
        "Calibration observations are matched by temporal and market scope, not by a direct fold foreign key.",
      ],
    },
    performance,
    risk,
    stability,
    calibration,
    decisionKpis,
    folds,
    warnings,
  };
}
