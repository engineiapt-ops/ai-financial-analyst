import { strict as assert } from "node:assert";
import {
  buildPortfolioStabilitySummary,
  PORTFOLIO_STABILITY_VERSION,
} from "./portfolioStability.js";

const summary = buildPortfolioStabilitySummary([
  { total_return_pct: 4, max_drawdown_pct: 2, sharpe: 0.8, sortino: 1.1, closed_trades: 10 },
  { total_return_pct: -1, max_drawdown_pct: 4, sharpe: 0.2, sortino: 0.4, closed_trades: 8 },
  { total_return_pct: 2, max_drawdown_pct: 3, sharpe: 0.5, sortino: 0.7, closed_trades: 12 },
  { total_return_pct: 0, max_drawdown_pct: 5, sharpe: null, sortino: null, closed_trades: 9 },
  { total_return_pct: 6, max_drawdown_pct: 1, sharpe: 1.0, sortino: 1.4, closed_trades: 11 },
]);

assert.equal(summary.version, PORTFOLIO_STABILITY_VERSION);
assert.equal(summary.foldCount, 5);
assert.equal(summary.positiveReturnFoldCount, 3);
assert.equal(summary.positiveReturnFoldPct, 60);
assert.equal(summary.nonNegativeReturnFoldPct, 80);
assert.equal(summary.returnMedianPct, 2);
assert.equal(summary.bestFoldReturnPct, 6);
assert.equal(summary.worstFoldReturnPct, -1);
assert.equal(summary.drawdownMedianPct, 3);
assert.equal(summary.worstDrawdownPct, 5);
assert.equal(summary.medianSharpe, 0.65);
assert.equal(summary.medianSortino, 0.9);
assert.equal(summary.closedTradesTotal, 50);
assert.equal(summary.closedTradesMedian, 10);

console.log("portfolio stability tests passed");
