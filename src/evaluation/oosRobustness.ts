import { createHash } from "node:crypto";
import type { OosFoldRow } from "./oosValidationReport.js";
import type { BacktestRun } from "../db/repository.js";

export const OOS_ROBUSTNESS_REPORT_VERSION = "oos-robustness-report.v1";
export const DEFAULT_BOOTSTRAP_ITERATIONS = 10_000;
export const DEFAULT_CONFIDENCE_LEVEL = 0.95;
export const MIN_RECOMMENDED_FOLDS = 5;
export const MIN_RECOMMENDED_TRADES = 30;

export interface BootstrapInterval {
  estimate: number | null;
  lower: number | null;
  upper: number | null;
}

export interface OosStrategyRobustness {
  estrategia: OosFoldRow["estrategia"];
  folds: number;
  usableFolds: number;
  totalClosedTrades: number;
  fullSampleTotalReturnPct: number | null;
  meanFoldReturnPct: number | null;
  profitableFoldRatePct: number | null;
  bestFoldReturnPct: number | null;
  worstFoldReturnPct: number | null;
  bootstrap: {
    iterations: number;
    confidenceLevel: number;
    totalReturnPct: BootstrapInterval;
    meanFoldReturnPct: BootstrapInterval;
    profitableFoldRatePct: BootstrapInterval;
  };
  leaveOneFoldOut: {
    minTotalReturnPct: number | null;
    maxTotalReturnPct: number | null;
    maxAbsoluteDeltaFromFullReturnPct: number | null;
    mostInfluentialFoldNumber: number | null;
  };
  concentration: {
    largestAbsoluteFoldContributionPct: number | null;
    foldNumber: number | null;
  };
}

export interface OosRobustnessReport {
  reportVersion: typeof OOS_ROBUSTNESS_REPORT_VERSION;
  generatedAt: string;
  scope: {
    backtestRunId: number;
    walkForwardRunId: number;
    ativo: BacktestRun["ativo"];
    timeframe: BacktestRun["timeframe"];
    validationFrom: string;
    validationTo: string;
    datasetHash: string | null;
    walkForwardDatasetHash: string | null;
  };
  methodology: {
    bootstrap: "resample-with-replacement";
    iterations: number;
    confidenceLevel: number;
    seed: string;
    noParameterOptimization: true;
    notes: string[];
  };
  strategies: OosStrategyRobustness[];
  warnings: string[];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const base = Math.floor(position);
  const rest = position - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function seedFromParts(parts: string[]): number {
  const digest = createHash("sha256").update(parts.join("|")).digest();
  let seed = digest.readUInt32BE(0);
  if (seed === 0) seed = 0x6d2b79f5;
  return seed >>> 0;
}

function nextRandom(state: { value: number }): number {
  let x = state.value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.value = x >>> 0;
  return state.value / 0x100000000;
}

function bootstrap(values: number[], iterations: number, confidenceLevel: number, seed: number) {
  if (!values.length) {
    return {
      totalReturnPct: { estimate: null, lower: null, upper: null },
      meanFoldReturnPct: { estimate: null, lower: null, upper: null },
      profitableFoldRatePct: { estimate: null, lower: null, upper: null },
    };
  }

  const state = { value: seed >>> 0 };
  const totalReturns: number[] = [];
  const means: number[] = [];
  const profitableRates: number[] = [];
  const positiveCount = (sample: number[]) => sample.filter((value) => value > 0).length / sample.length;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    let profitable = 0;
    for (let index = 0; index < values.length; index += 1) {
      const sampled = values[Math.floor(nextRandom(state) * values.length)];
      total += sampled;
      if (sampled > 0) profitable += 1;
    }

    totalReturns.push(total);
    means.push(total / values.length);
    profitableRates.push((profitable / values.length) * 100);
  }

  const alpha = (1 - confidenceLevel) / 2;

  return {
    totalReturnPct: {
      estimate: values.reduce((sum, value) => sum + value, 0),
      lower: quantile(totalReturns, alpha),
      upper: quantile(totalReturns, 1 - alpha),
    },
    meanFoldReturnPct: {
      estimate: mean(values),
      lower: quantile(means, alpha),
      upper: quantile(means, 1 - alpha),
    },
    profitableFoldRatePct: {
      estimate: (positiveCount(values) * 100),
      lower: quantile(profitableRates, alpha),
      upper: quantile(profitableRates, 1 - alpha),
    },
  };
}

function buildStrategyRobustness(
  estrategia: OosFoldRow["estrategia"],
  rows: OosFoldRow[],
  iterations: number,
  confidenceLevel: number,
  seed: number,
): OosStrategyRobustness {
  const usable = rows.filter(
    (row) =>
      row.status === "ok" &&
      Number.isFinite(row.total_profit_percent),
  );
  const returns = usable.map((row) => row.total_profit_percent);
  const fullTotal = returns.length ? returns.reduce((sum, value) => sum + value, 0) : null;
  const foldMean = mean(returns);
  const profitableFoldRate = returns.length
    ? (returns.filter((value) => value > 0).length / returns.length) * 100
    : null;

  let looMin: number | null = null;
  let looMax: number | null = null;
  let maxAbsoluteDelta = null as number | null;
  let mostInfluentialFold: number | null = null;

  for (const row of usable) {
    const looTotal = (fullTotal ?? 0) - row.total_profit_percent;
    looMin = looMin === null ? looTotal : Math.min(looMin, looTotal);
    looMax = looMax === null ? looTotal : Math.max(looMax, looTotal);

    const delta = Math.abs(looTotal - (fullTotal ?? 0));
    if (maxAbsoluteDelta === null || delta > maxAbsoluteDelta) {
      maxAbsoluteDelta = delta;
      mostInfluentialFold = row.fold_number;
    }
  }

  const absoluteContributionDenominator = returns.reduce(
    (sum, value) => sum + Math.abs(value),
    0,
  );
  let largestContribution = null as number | null;
  let largestContributionFold: number | null = null;

  if (absoluteContributionDenominator > 0) {
    for (const row of usable) {
      const contribution = (Math.abs(row.total_profit_percent) / absoluteContributionDenominator) * 100;
      if (largestContribution === null || contribution > largestContribution) {
        largestContribution = contribution;
        largestContributionFold = row.fold_number;
      }
    }
  }

  return {
    estrategia,
    folds: rows.length,
    usableFolds: usable.length,
    totalClosedTrades: usable.reduce((sum, row) => sum + row.closed_trades, 0),
    fullSampleTotalReturnPct: fullTotal,
    meanFoldReturnPct: foldMean,
    profitableFoldRatePct: profitableFoldRate,
    bestFoldReturnPct: returns.length ? Math.max(...returns) : null,
    worstFoldReturnPct: returns.length ? Math.min(...returns) : null,
    bootstrap: {
      iterations,
      confidenceLevel,
      ...bootstrap(
        returns,
        iterations,
        confidenceLevel,
        seedFromParts([String(seed), estrategia, ...returns.map((value) => value.toFixed(10))]),
      ),
    },
    leaveOneFoldOut: {
      minTotalReturnPct: looMin,
      maxTotalReturnPct: looMax,
      maxAbsoluteDeltaFromFullReturnPct: maxAbsoluteDelta,
      mostInfluentialFoldNumber: mostInfluentialFold,
    },
    concentration: {
      largestAbsoluteFoldContributionPct: largestContribution,
      foldNumber: largestContributionFold,
    },
  };
}

export function buildOosRobustnessReport(input: {
  backtestRun: Pick<
    BacktestRun,
    | "id"
    | "mode"
    | "ativo"
    | "timeframe"
    | "periodoFim"
    | "validationStart"
    | "datasetHash"
  >;
  walkForwardRunId: number;
  walkForwardDatasetHash?: string | null;
  folds: OosFoldRow[];
  iterations?: number;
  confidenceLevel?: number;
  generatedAt?: Date;
}): OosRobustnessReport {
  const iterations = input.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const confidenceLevel = input.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;

  if (input.backtestRun.mode !== "oos") {
    throw new Error("OOS robustness report requires a backtest run in oos mode");
  }
  if (!input.backtestRun.validationStart) {
    throw new Error("Backtest run is missing validationStart");
  }
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 100000) {
    throw new Error("bootstrap iterations must be an integer between 1000 and 100000");
  }
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error("confidenceLevel must be greater than 0 and less than 1");
  }

  const validationFrom = input.backtestRun.validationStart;
  const validationTo = input.backtestRun.periodoFim;
  const scopedFolds = input.folds
    .filter(
      (row) =>
        row.status !== "error" &&
        row.test_start.getTime() >= validationFrom.getTime() &&
        row.test_end.getTime() <= validationTo.getTime(),
    )
    .map((row) => ({ ...row }));

  const strategyNames = ["baseline", "baseline_risk", "buyhold", "jev"] as const;
  const byStrategy = strategyNames.map((estrategia) => ({
    estrategia,
    rows: scopedFolds.filter((row) => row.estrategia === estrategia),
  }));

  const seed = seedFromParts([
    input.backtestRun.datasetHash ?? "no-dataset-hash",
    String(input.backtestRun.id),
    String(input.walkForwardRunId),
    validationFrom.toISOString(),
    validationTo.toISOString(),
  ]);
  const warnings: string[] = [];

  if (
    input.backtestRun.datasetHash &&
    input.walkForwardDatasetHash &&
    input.backtestRun.datasetHash !== input.walkForwardDatasetHash
  ) {
    warnings.push("Backtest and walk-forward dataset hashes do not match.");
  }

  if (scopedFolds.length === 0) {
    warnings.push("No usable walk-forward folds fall completely inside the OOS validation window.");
  }
  if (scopedFolds.length > 0 && scopedFolds.length < MIN_RECOMMENDED_FOLDS) {
    warnings.push(
      `Only ${scopedFolds.length} fold rows are available; ${MIN_RECOMMENDED_FOLDS} is the recommended minimum for robustness analysis.`,
    );
  }

  const strategies = byStrategy.map(({ estrategia, rows }) =>
    buildStrategyRobustness(estrategia, rows, iterations, confidenceLevel, seed),
  );

  for (const strategy of strategies) {
    if (strategy.totalClosedTrades > 0 && strategy.totalClosedTrades < MIN_RECOMMENDED_TRADES) {
      warnings.push(
        `${strategy.estrategia}: only ${strategy.totalClosedTrades} closed trades; ${MIN_RECOMMENDED_TRADES} is the recommended minimum for robustness analysis.`,
      );
    }
    if (strategy.usableFolds > 0 && strategy.concentration.largestAbsoluteFoldContributionPct !== null &&
        strategy.concentration.largestAbsoluteFoldContributionPct > 60) {
      warnings.push(
        `${strategy.estrategia}: one fold accounts for more than 60% of absolute fold-return contribution.`,
      );
    }
  }

  return {
    reportVersion: OOS_ROBUSTNESS_REPORT_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    scope: {
      backtestRunId: input.backtestRun.id,
      walkForwardRunId: input.walkForwardRunId,
      ativo: input.backtestRun.ativo,
      timeframe: input.backtestRun.timeframe,
      validationFrom: validationFrom.toISOString(),
      validationTo: validationTo.toISOString(),
      datasetHash: input.backtestRun.datasetHash,
      walkForwardDatasetHash: input.walkForwardDatasetHash ?? null,
    },
    methodology: {
      bootstrap: "resample-with-replacement",
      iterations,
      confidenceLevel,
      seed: seed.toString(16).padStart(8, "0"),
      noParameterOptimization: true,
      notes: [
        "Bootstrap intervals resample persisted walk-forward fold returns; they do not simulate new market paths.",
        "Fold dependence and time-series autocorrelation are not modeled by this bootstrap.",
        "Leave-one-fold-out sensitivity shows how much aggregate fold return changes when a single validation fold is excluded.",
        "Confidence intervals are uncertainty diagnostics, not guarantees about future performance.",
      ],
    },
    strategies,
    warnings,
  };
}
