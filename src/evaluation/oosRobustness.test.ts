import { strict as assert } from "node:assert";
import {
  buildOosRobustnessReport,
  DEFAULT_BOOTSTRAP_ITERATIONS,
} from "./oosRobustness.js";
import type { OosFoldRow } from "./oosValidationReport.js";

function fold(
  foldNumber: number,
  estrategia: OosFoldRow["estrategia"],
  returnPct: number,
): OosFoldRow {
  return {
    fold_number: foldNumber,
    train_start: new Date("2025-01-01T00:00:00Z"),
    train_end: new Date("2025-02-01T00:00:00Z"),
    test_start: new Date(`2026-0${foldNumber + 1}-01T00:00:00Z`),
    test_end: new Date(`2026-0${foldNumber + 1}-15T00:00:00Z`),
    estrategia,
    status: "ok",
    test_signals: 20,
    total_trades: 10,
    closed_trades: 10,
    open_trades: 0,
    win_rate: 50,
    profit_factor: 1.2,
    total_profit_percent: returnPct,
    avg_profit_percent: returnPct / 10,
    expectancy_percent: returnPct / 10,
    max_drawdown_percent: 4,
    gross_total_profit_percent: returnPct + 1,
    total_fee_percent: 0.5,
    total_slippage_percent: 0.5,
    avg_candles_held: 4,
    notas: null,
  };
}

const folds = [
  fold(1, "baseline", 2),
  fold(2, "baseline", -1),
  fold(3, "baseline", 3),
  fold(4, "baseline", -2),
  fold(5, "baseline", 1),
  fold(1, "buyhold", 4),
  fold(2, "buyhold", -1),
  fold(3, "buyhold", 2),
];

const input = {
  backtestRun: {
    id: 10,
    mode: "oos" as const,
    ativo: "BTCUSDT",
    timeframe: "1h" as const,
    periodoFim: new Date("2026-12-31T00:00:00Z"),
    validationStart: new Date("2026-02-01T00:00:00Z"),
    datasetHash: "abcdef0123456789",
  },
  walkForwardRunId: 20,
  folds,
  iterations: DEFAULT_BOOTSTRAP_ITERATIONS,
  confidenceLevel: 0.95,
};

const first = buildOosRobustnessReport(input);
const second = buildOosRobustnessReport(input);

assert.equal(first.reportVersion, "oos-robustness-report.v1");
assert.equal(first.strategies.length, 4);
assert.equal(first.strategies.find((item) => item.estrategia === "baseline")?.usableFolds, 5);
assert.equal(first.strategies.find((item) => item.estrategia === "baseline")?.fullSampleTotalReturnPct, 3);
assert.equal(first.strategies.find((item) => item.estrategia === "baseline")?.leaveOneFoldOut.minTotalReturnPct, 0);
assert.equal(first.strategies.find((item) => item.estrategia === "baseline")?.leaveOneFoldOut.maxTotalReturnPct, 5);
assert.equal(first.strategies.find((item) => item.estrategia === "baseline")?.concentration.foldNumber, 3);
assert.deepEqual(first.strategies, second.strategies);
assert.ok(first.strategies.find((item) => item.estrategia === "baseline")?.bootstrap.totalReturnPct.lower !== null);
assert.ok(first.strategies.find((item) => item.estrategia === "baseline")?.bootstrap.totalReturnPct.upper !== null);

const outOfScope = buildOosRobustnessReport({
  ...input,
  folds: [
    ...folds,
    {
      ...fold(6, "baseline", 99),
      test_start: new Date("2027-01-01T00:00:00Z"),
      test_end: new Date("2027-01-15T00:00:00Z"),
    },
  ],
});

assert.equal(
  outOfScope.strategies.find((item) => item.estrategia === "baseline")?.usableFolds,
  5,
);

console.log("oos robustness tests passed");
