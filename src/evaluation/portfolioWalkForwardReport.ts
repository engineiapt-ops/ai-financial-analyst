import {
  getWalkForwardPortfolioFolds,
  getWalkForwardPortfolioRuns,
  getWalkForwardRun,
} from "../db/repository.js";

export const PORTFOLIO_WALK_FORWARD_REPORT_VERSION =
  "portfolio-walk-forward-report.v1";

type StrategyRun = {
  id: number;
  strategy: "baseline" | "baseline_risk";
  initial_capital: number | string;
  position_size_pct: number | string;
  max_gross_exposure_pct: number | string;
  portfolio_model_version: string;
  final_equity: number | string;
  total_return_pct: number | string;
  cagr_pct: number | string | null;
  max_drawdown_pct: number | string;
  sharpe: number | string | null;
  sortino: number | string | null;
  total_signals: number;
  executed_trades: number;
  closed_trades: number;
  rejected_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_realized_pnl: number | string;
  total_fees: number | string;
  total_slippage: number | string;
  max_open_positions: number;
  max_gross_exposure: number | string;
  risk_gate_blocks: number;
};

type FoldRow = {
  fold_number: number;
  initial_capital: number | string;
  final_equity: number | string;
  total_return_pct: number | string;
  max_drawdown_pct: number | string;
  sharpe: number | string | null;
  sortino: number | string | null;
  total_signals: number;
  executed_trades: number;
  closed_trades: number;
  rejected_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_realized_pnl: number | string;
  total_fees: number | string;
  total_slippage: number | string;
  max_open_positions: number;
  max_gross_exposure: number | string;
  risk_gate_blocks: number;
};

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strategyChecks(strategy: StrategyRun) {
  const positionSizePct = num(strategy.position_size_pct) ?? 0;
  const maxGrossExposurePct = num(strategy.max_gross_exposure_pct) ?? 0;
  const maxAllowedOpenPositions =
    positionSizePct > 0
      ? Math.floor((maxGrossExposurePct + 1e-9) / positionSizePct)
      : 0;

  return {
    exposureConstraint: {
      passed:
        maxAllowedOpenPositions > 0 &&
        strategy.max_open_positions <= maxAllowedOpenPositions,
      maxAllowedOpenPositions,
      observedMaxOpenPositions: strategy.max_open_positions,
      maxGrossExposurePct,
      positionSizePct,
    },
    finiteCapital:
      (num(strategy.initial_capital) ?? 0) > 0 &&
      (num(strategy.final_equity) ?? 0) > 0,
    signalsConsistent:
      strategy.total_signals >=
      strategy.executed_trades + strategy.rejected_trades,
  };
}

export async function buildPortfolioWalkForwardReport(
  walkForwardRunId: number,
) {
  const sourceRun = await getWalkForwardRun(walkForwardRunId);
  if (!sourceRun) {
    throw new Error(`Walk-forward Run ${walkForwardRunId} not found`);
  }

  const portfolioRuns = (await getWalkForwardPortfolioRuns(
    walkForwardRunId,
  )) as unknown as StrategyRun[];

  if (!portfolioRuns.length) {
    throw new Error(
      `No portfolio walk-forward results found for Run ${walkForwardRunId}`,
    );
  }

  const runSummaries = await Promise.all(
    portfolioRuns.map(async (run) => ({
      ...run,
      folds: (await getWalkForwardPortfolioFolds(run.id)) as unknown as FoldRow[],
    })),
  );

  const byStrategy = new Map(runSummaries.map((run) => [run.strategy, run]));
  const baseline = byStrategy.get("baseline") ?? null;
  const baselineRisk = byStrategy.get("baseline_risk") ?? null;

  const foldNumbers = Array.from(
    new Set(
      runSummaries.flatMap((run) => run.folds.map((fold) => Number(fold.fold_number))),
    ),
  ).sort((a, b) => a - b);

  const folds = foldNumbers.map((foldNumber) => {
    const base = baseline?.folds.find(
      (fold) => Number(fold.fold_number) === foldNumber,
    ) ?? null;
    const risk = baselineRisk?.folds.find(
      (fold) => Number(fold.fold_number) === foldNumber,
    ) ?? null;

    const returnDeltaPct =
      base && risk
        ? (num(risk.total_return_pct) ?? 0) -
          (num(base.total_return_pct) ?? 0)
        : null;
    const drawdownDeltaPct =
      base && risk
        ? (num(risk.max_drawdown_pct) ?? 0) -
          (num(base.max_drawdown_pct) ?? 0)
        : null;

    return {
      foldNumber,
      baseline: base,
      baselineRisk: risk,
      deltas: {
        returnDeltaPct,
        drawdownDeltaPct,
        executedTradesDelta:
          base && risk ? risk.executed_trades - base.executed_trades : null,
        riskGateBlocks: risk?.risk_gate_blocks ?? 0,
      },
    };
  });

  const strategyReports = runSummaries.map((run) => {
    const checks = strategyChecks(run);
    return {
      strategy: run.strategy,
      portfolioModelVersion: run.portfolio_model_version,
      finalEquity: num(run.final_equity),
      totalReturnPct: num(run.total_return_pct),
      cagrPct: num(run.cagr_pct),
      maxDrawdownPct: num(run.max_drawdown_pct),
      sharpe: num(run.sharpe),
      sortino: num(run.sortino),
      totalSignals: run.total_signals,
      executedTrades: run.executed_trades,
      rejectedTrades: run.rejected_trades,
      winningTrades: run.winning_trades,
      losingTrades: run.losing_trades,
      totalRealizedPnl: num(run.total_realized_pnl),
      totalFees: num(run.total_fees),
      totalSlippage: num(run.total_slippage),
      maxOpenPositions: run.max_open_positions,
      maxGrossExposure: num(run.max_gross_exposure),
      riskGateBlocks: run.risk_gate_blocks,
      checks,
    };
  });

  const completeStrategySet =
    Boolean(baseline) && Boolean(baselineRisk) && runSummaries.length >= 2;

  const expectedFoldCount = Math.floor(
    (sourceRun.candlesTotal - sourceRun.initialTrainCandles) /
      sourceRun.stepCandles,
  );

  const completeFoldCoverage =
    Boolean(baseline) &&
    Boolean(baselineRisk) &&
    baseline!.folds.length === expectedFoldCount &&
    baselineRisk!.folds.length === expectedFoldCount &&
    foldNumbers.length === expectedFoldCount;

  const totalRiskBlocks = baselineRisk?.risk_gate_blocks ?? 0;
  const observedPositiveReturnDeltas = folds.filter(
    (fold) => (fold.deltas.returnDeltaPct ?? 0) > 0,
  ).length;
  const observedLowerDrawdownDeltas = folds.filter(
    (fold) => (fold.deltas.drawdownDeltaPct ?? 0) < 0,
  ).length;

  const allExposureChecksPassed = strategyReports.every(
    (strategy) => strategy.checks.exposureConstraint.passed,
  );
  const allCapitalChecksPassed = strategyReports.every(
    (strategy) => strategy.checks.finiteCapital,
  );
  const allSignalAccountingChecksPassed = strategyReports.every(
    (strategy) => strategy.checks.signalsConsistent,
  );

  const checks = [
    {
      key: "strategy-set",
      passed: completeStrategySet,
      message: completeStrategySet
        ? "Baseline and baseline_risk are both persisted."
        : "One or more required portfolio strategies are missing.",
    },
    {
      key: "fold-coverage",
      passed: completeFoldCoverage,
      message: completeFoldCoverage
        ? `${expectedFoldCount} folds are present for both portfolio strategies.`
        : "Portfolio fold coverage is incomplete.",
    },
    {
      key: "finite-capital",
      passed: allCapitalChecksPassed,
      message: allCapitalChecksPassed
        ? "All portfolio runs have finite positive initial/final equity."
        : "At least one portfolio run has invalid capital values.",
    },
    {
      key: "exposure-cap",
      passed: allExposureChecksPassed,
      message: allExposureChecksPassed
        ? "Observed concurrent positions respect the configured exposure/position-size relationship."
        : "At least one portfolio run exceeds the theoretical full-position concurrency cap.",
    },
    {
      key: "signal-accounting",
      passed: allSignalAccountingChecksPassed,
      message: allSignalAccountingChecksPassed
        ? "Executed plus rejected trades do not exceed the available signal count."
        : "At least one portfolio run has inconsistent signal accounting.",
    },
  ];

  return {
    reportVersion: PORTFOLIO_WALK_FORWARD_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    scope: {
      walkForwardRunId,
      asset: sourceRun.ativo,
      timeframe: sourceRun.timeframe,
      candlesTotal: sourceRun.candlesTotal,
      datasetHash: sourceRun.datasetHash,
      initialTrainCandles: sourceRun.initialTrainCandles,
      testCandles: sourceRun.testCandles,
      stepCandles: sourceRun.stepCandles,
      lookaheadCandles: sourceRun.lookaheadCandles,
      executionModelVersion: sourceRun.executionModelVersion,
    },
    configuration: {
      initialCapital: num(baseline?.initial_capital ?? baselineRisk?.initial_capital),
      positionSizePct: num(
        baseline?.position_size_pct ?? baselineRisk?.position_size_pct,
      ),
      maxGrossExposurePct: num(
        baseline?.max_gross_exposure_pct ??
          baselineRisk?.max_gross_exposure_pct,
      ),
    },
    strategies: strategyReports,
    folds,
    diagnostics: {
      totalRiskGateBlocks: totalRiskBlocks,
      foldsWithPositiveRiskReturnDelta: observedPositiveReturnDeltas,
      foldsWithLowerRiskDrawdown: observedLowerDrawdownDeltas,
      foldCount: foldNumbers.length,
    },
    checks,
    notes: [
      "This report is diagnostic and does not select a preferred strategy.",
      "Returns are account-level finite-capital portfolio results, not sums of signal percentages.",
      "baseline_risk uses regime-v1/risk-engine-v1 with thresholds calibrated on each fold's pre-test window.",
      "No parameter optimization is performed by this report.",
    ],
  };
}
