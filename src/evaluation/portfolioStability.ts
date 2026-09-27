export const PORTFOLIO_STABILITY_VERSION = "portfolio-stability.v1";

export interface PortfolioStabilitySummary {
  version: typeof PORTFOLIO_STABILITY_VERSION;
  foldCount: number;
  positiveReturnFoldCount: number;
  positiveReturnFoldPct: number | null;
  nonNegativeReturnFoldPct: number | null;
  returnMeanPct: number | null;
  returnMedianPct: number | null;
  returnStdDevPct: number | null;
  bestFoldReturnPct: number | null;
  worstFoldReturnPct: number | null;
  drawdownMeanPct: number | null;
  drawdownMedianPct: number | null;
  drawdownStdDevPct: number | null;
  worstDrawdownPct: number | null;
  medianSharpe: number | null;
  medianSortino: number | null;
  closedTradesTotal: number;
  closedTradesMedian: number | null;
}

type FoldMetrics = {
  total_return_pct: number | string;
  max_drawdown_pct: number | string;
  sharpe?: number | string | null;
  sortino?: number | string | null;
  closed_trades: number;
};

function finiteNumbers(values: Array<number | string | null | undefined>): number[] {
  return values
    .map((value) => (value === null || value === undefined ? null : Number(value)))
    .filter((value): value is number => value !== null && Number.isFinite(value));
}

function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stddev(values: number[]): number | null {
  if (!values.length) return null;
  const avg = mean(values);
  if (avg === null) return null;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length,
  );
}

export function buildPortfolioStabilitySummary(
  folds: FoldMetrics[],
): PortfolioStabilitySummary {
  const returns = finiteNumbers(folds.map((fold) => fold.total_return_pct));
  const drawdowns = finiteNumbers(folds.map((fold) => fold.max_drawdown_pct));
  const sharpes = finiteNumbers(folds.map((fold) => fold.sharpe));
  const sortinos = finiteNumbers(folds.map((fold) => fold.sortino));
  const positiveReturnFoldCount = folds.filter(
    (fold) => Number(fold.total_return_pct) > 0,
  ).length;
  const nonNegativeReturnFoldCount = folds.filter(
    (fold) => Number(fold.total_return_pct) >= 0,
  ).length;
  const closedTrades = folds
    .map((fold) => fold.closed_trades)
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);

  return {
    version: PORTFOLIO_STABILITY_VERSION,
    foldCount: folds.length,
    positiveReturnFoldCount,
    positiveReturnFoldPct: folds.length
      ? (positiveReturnFoldCount / folds.length) * 100
      : null,
    nonNegativeReturnFoldPct: folds.length
      ? (nonNegativeReturnFoldCount / folds.length) * 100
      : null,
    returnMeanPct: mean(returns),
    returnMedianPct: median(returns),
    returnStdDevPct: stddev(returns),
    bestFoldReturnPct: returns.length ? Math.max(...returns) : null,
    worstFoldReturnPct: returns.length ? Math.min(...returns) : null,
    drawdownMeanPct: mean(drawdowns),
    drawdownMedianPct: median(drawdowns),
    drawdownStdDevPct: stddev(drawdowns),
    worstDrawdownPct: drawdowns.length ? Math.max(...drawdowns) : null,
    medianSharpe: median(sharpes),
    medianSortino: median(sortinos),
    closedTradesTotal: closedTrades.reduce((sum, value) => sum + value, 0),
    closedTradesMedian: median(closedTrades),
  };
}
