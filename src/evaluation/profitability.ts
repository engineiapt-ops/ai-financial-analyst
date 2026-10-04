export const PROFITABILITY_EVALUATION_VERSION = "profitability-evaluation-v1";
export const DEFAULT_MIN_OOS_TRADES = 30;
export const STRESS_COST_MULTIPLIERS = [1.25, 1.5, 2] as const;

export interface ProfitabilityTrade {
  grossProfitPct: number;
  feePct: number;
  slippagePct: number;
}

export interface ProfitabilitySummary {
  totalTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number | null;
  totalGrossProfitPct: number;
  totalCostPct: number;
  totalNetProfitPct: number;
  avgNetProfitPct: number | null;
  expectancyPct: number | null;
  profitFactor: number | null;
  maxDrawdownPct: number;
  confidenceInterval95Pct: {
    lower: number;
    upper: number;
  } | null;
  confidenceMethod: "normal_approximation";
  minTradesRequired: number;
  sufficientSample: boolean;
}

export interface StressScenario {
  costIncreasePct: 25 | 50 | 100;
  costMultiplier: 1.25 | 1.5 | 2;
  totalNetProfitPct: number;
  expectancyPct: number | null;
  profitableTrades: number;
  losingTrades: number;
}

export interface ProfitabilityEvaluation {
  version: typeof PROFITABILITY_EVALUATION_VERSION;
  strategy: string;
  summary: ProfitabilitySummary;
  stress: StressScenario[];
  warnings: string[];
}

export interface WalkForwardFoldInput {
  instrument: string;
  fold: number;
  trades: ProfitabilityTrade[];
}

export interface WalkForwardEvaluation {
  version: typeof PROFITABILITY_EVALUATION_VERSION;
  instrument: string;
  minOosTrades: number;
  folds: Array<{
    fold: number;
    evaluation: ProfitabilityEvaluation;
  }>;
  aggregate: ProfitabilityEvaluation;
}

function validateTrade(trade: ProfitabilityTrade): void {
  if (
    !Number.isFinite(trade.grossProfitPct) ||
    !Number.isFinite(trade.feePct) ||
    !Number.isFinite(trade.slippagePct) ||
    trade.feePct < 0 ||
    trade.slippagePct < 0
  ) {
    throw new Error("Invalid profitability trade");
  }
}

function normalQuantile95(): number {
  return 1.96;
}

function maxDrawdown(trades: ProfitabilityTrade[]): number {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const trade of trades) {
    equity += trade.grossProfitPct - trade.feePct - trade.slippagePct;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

function confidenceInterval(values: number[]): { lower: number; upper: number } | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { lower: mean, upper: mean };

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  const standardError = Math.sqrt(variance / values.length);
  const margin = normalQuantile95() * standardError;
  return { lower: mean - margin, upper: mean + margin };
}

export function summarizeProfitability(
  trades: ProfitabilityTrade[],
  minTrades = DEFAULT_MIN_OOS_TRADES,
): ProfitabilitySummary {
  if (!Number.isInteger(minTrades) || minTrades < 1) {
    throw new Error("minTrades must be a positive integer");
  }

  trades.forEach(validateTrade);

  const netValues = trades.map(
    (trade) => trade.grossProfitPct - trade.feePct - trade.slippagePct,
  );
  const gross = trades.reduce((sum, trade) => sum + trade.grossProfitPct, 0);
  const cost = trades.reduce((sum, trade) => sum + trade.feePct + trade.slippagePct, 0);
  const net = trades.reduce(
    (sum, trade) => sum + trade.grossProfitPct - trade.feePct - trade.slippagePct,
    0,
  );
  const winners = netValues.filter((value) => value > 0);
  const losers = netValues.filter((value) => value < 0);
  const positive = winners.reduce((sum, value) => sum + value, 0);
  const negative = losers.reduce((sum, value) => sum + value, 0);

  return {
    totalTrades: trades.length,
    closedTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRatePct: trades.length ? (winners.length / trades.length) * 100 : null,
    totalGrossProfitPct: gross,
    totalCostPct: cost,
    totalNetProfitPct: net,
    avgNetProfitPct: trades.length ? net / trades.length : null,
    expectancyPct: trades.length ? net / trades.length : null,
    profitFactor: negative < 0 ? positive / Math.abs(negative) : null,
    maxDrawdownPct: maxDrawdown(trades),
    confidenceInterval95Pct: confidenceInterval(netValues),
    confidenceMethod: "normal_approximation",
    minTradesRequired: minTrades,
    sufficientSample: trades.length >= minTrades,
  };
}

export function evaluateProfitability(
  strategy: string,
  trades: ProfitabilityTrade[],
  minTrades = DEFAULT_MIN_OOS_TRADES,
): ProfitabilityEvaluation {
  const summary = summarizeProfitability(trades, minTrades);
  const stress = STRESS_COST_MULTIPLIERS.map((multiplier) => {
    const netValues = trades.map(
      (trade) =>
        trade.grossProfitPct -
        (trade.feePct + trade.slippagePct) * multiplier,
    );
    return {
      costIncreasePct: (multiplier - 1) * 100 as 25 | 50 | 100,
      costMultiplier: multiplier,
      totalNetProfitPct: netValues.reduce((sum, value) => sum + value, 0),
      expectancyPct: netValues.length
        ? netValues.reduce((sum, value) => sum + value, 0) / netValues.length
        : null,
      profitableTrades: netValues.filter((value) => value > 0).length,
      losingTrades: netValues.filter((value) => value < 0).length,
    };
  });

  const warnings: string[] = [];
  if (!summary.sufficientSample) {
    warnings.push(
      `OOS sample below minimum configured size: ${summary.closedTrades}/${summary.minTradesRequired} trades.`,
    );
  }
  if (
    summary.confidenceInterval95Pct &&
    summary.confidenceInterval95Pct.lower <= 0
  ) {
    warnings.push("95% confidence interval for expectancy includes non-positive values.");
  }

  return {
    version: PROFITABILITY_EVALUATION_VERSION,
    strategy,
    summary,
    stress,
    warnings,
  };
}

export function buildAlwaysWaitBaseline(strategy = "always_wait"): ProfitabilityEvaluation {
  return evaluateProfitability(strategy, []);
}

export function buildBuyAndHoldTrade(
  entryPrice: number,
  exitPrice: number,
  feePct: number,
  slippagePct: number,
): ProfitabilityTrade {
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(exitPrice) ||
    exitPrice <= 0
  ) {
    throw new Error("Buy-and-hold prices must be positive and finite");
  }
  return {
    grossProfitPct: ((exitPrice - entryPrice) / entryPrice) * 100,
    feePct,
    slippagePct,
  };
}

export function evaluateWalkForward(
  folds: WalkForwardFoldInput[],
  minOosTrades = DEFAULT_MIN_OOS_TRADES,
): WalkForwardEvaluation {
  if (folds.length === 0) {
    throw new Error("At least one walk-forward fold is required");
  }
  const instrument = folds[0].instrument;
  if (folds.some((fold) => fold.instrument !== instrument)) {
    throw new Error("All walk-forward folds must use the same instrument");
  }

  const evaluations = folds.map((fold) => ({
    fold: fold.fold,
    evaluation: evaluateProfitability(
      `${instrument}:fold-${fold.fold}`,
      fold.trades,
      minOosTrades,
    ),
  }));

  const allTrades = folds.flatMap((fold) => fold.trades);
  return {
    version: PROFITABILITY_EVALUATION_VERSION,
    instrument,
    minOosTrades,
    folds: evaluations,
    aggregate: evaluateProfitability(`${instrument}:aggregate`, allTrades, minOosTrades),
  };
}
