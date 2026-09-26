import { computeIndicatorsSeries } from "../features/indicators.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import {
  createWalkForwardRun,
  getMarketData,
  saveWalkForwardFold,
  getWalkForwardFolds,
} from "../db/repository.js";
import {
  DEFAULT_EXECUTION_COSTS,
  EXECUTION_MODEL_VERSION,
  simulateTrade,
  type TradeOutcome,
} from "../papertrading/simulator.js";
import { computeDatasetHash } from "../marketdata/dataset.js";
import { assertKlinesAvailableAsOf } from "../marketdata/pointInTime.js";
import { freezeThresholds, thresholds } from "../config/thresholds.js";
import type { Kline, MarketState } from "../types.js";

const TARGET_PCT = 0.01;
const STOP_PCT = 0.005;
const LOOKAHEAD_CANDLES = 20;
const DEFAULT_INITIAL_TRAIN = 2000;
const DEFAULT_TEST_CANDLES = 500;
const DEFAULT_STEP_CANDLES = 500;
const CONCURRENCY = 2;

interface EvaluatedTrade {
  trade: TradeOutcome;
  exitIndex: number;
}

interface StrategySummary {
  status: "ok" | "unavailable" | "error";
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  totalProfitPercent: number;
  avgProfitPercent: number;
  expectancyPercent: number;
  maxDrawdownPercent: number;
  grossTotalProfitPercent: number;
  totalFeePercent: number;
  totalSlippagePercent: number;
  avgCandlesHeld: number | null;
  notas?: string;
}

function summarize(entries: EvaluatedTrade[]): StrategySummary {
  const ordered = [...entries].sort((a, b) => a.exitIndex - b.exitIndex);
  const closed = ordered.filter((entry) => entry.trade.outcome !== "open");
  const wins = closed.filter((entry) => entry.trade.outcome === "win");
  const gains = closed.reduce((sum, entry) => sum + Math.max(0, entry.trade.profitPercent), 0);
  const losses = closed.reduce((sum, entry) => sum + Math.min(0, entry.trade.profitPercent), 0);
  const net = closed.reduce((sum, entry) => sum + entry.trade.profitPercent, 0);
  const gross = closed.reduce((sum, entry) => sum + entry.trade.grossProfitPercent, 0);

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const entry of closed) {
    cumulative += entry.trade.profitPercent;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return {
    status: "ok",
    totalTrades: entries.length,
    closedTrades: closed.length,
    openTrades: entries.length - closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    profitFactor: losses < 0 ? gains / Math.abs(losses) : null,
    totalProfitPercent: net,
    avgProfitPercent: closed.length ? net / closed.length : 0,
    expectancyPercent: closed.length ? net / closed.length : 0,
    maxDrawdownPercent: maxDrawdown,
    grossTotalProfitPercent: gross,
    totalFeePercent: closed.reduce((sum, entry) => sum + entry.trade.feePercent, 0),
    totalSlippagePercent: closed.reduce((sum, entry) => sum + entry.trade.slippagePercent, 0),
    avgCandlesHeld: closed.length
      ? closed.reduce((sum, entry) => sum + entry.trade.candlesHeld, 0) / closed.length
      : null,
  };
}

function buildMarket(klines: Kline[], indicatorsSeries: ReturnType<typeof computeIndicatorsSeries>, index: number): MarketState {
  const candle = klines[index];
  const asOf = candle.closeTime ?? candle.openTime;
  return {
    ativo: "BTCUSDT",
    timeframe: "1h",
    timestamp: asOf.getTime(),
    dataAsOf: asOf.getTime(),
    precoAtual: candle.close,
    indicators: indicatorsSeries[index],
    noticiaSentimento: 0,
  };
}

function simulateBuyHold(klines: Kline[], start: number, end: number): EvaluatedTrade {
  const first = klines[start];
  const last = klines[end];
  const signalPrice = first.close;
  const entryPrice = signalPrice * (1 + DEFAULT_EXECUTION_COSTS.slippagePct);
  const exitPrice = last.close * (1 - DEFAULT_EXECUTION_COSTS.slippagePct);
  const grossProfitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  const feePercent = DEFAULT_EXECUTION_COSTS.feePct * 2 * 100;
  const profitPercent = grossProfitPercent - feePercent;
  let maxDrawdownPercent = 0;
  let peak = 1;

  for (let i = start; i <= end; i += 1) {
    const equity = (klines[i].close / entryPrice) * (1 - DEFAULT_EXECUTION_COSTS.feePct);
    peak = Math.max(peak, equity);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - equity) * 100);
  }

  const trade: TradeOutcome = {
    signalPrice,
    entryPrice,
    exitPrice,
    outcome: profitPercent >= 0 ? "win" : "loss",
    profitPercent,
    grossProfitPercent,
    feePercent,
    slippagePercent: (DEFAULT_EXECUTION_COSTS.slippagePct * 2) * 100,
    candlesHeld: end - start,
    exitReason: "end",
    targetPrice: entryPrice,
    stopPrice: entryPrice,
    maxFavorableExcursionPct: 0,
    maxAdverseExcursionPct: -maxDrawdownPercent,
  };

  return { trade, exitIndex: end };
}

function getOptions() {
  const args = new Map<string, string>();
  for (let i = 0; i < process.argv.length - 1; i += 1) {
    if (process.argv[i].startsWith("--")) args.set(process.argv[i], process.argv[i + 1]);
  }
  return {
    ativo: (args.get("--symbol") ?? "BTCUSDT").toUpperCase(),
    timeframe: (args.get("--timeframe") ?? "1h") as "1h" | "4h" | "1d",
    candles: Number(args.get("--candles") ?? 5000),
    initialTrainCandles: Number(args.get("--initial-train") ?? DEFAULT_INITIAL_TRAIN),
    testCandles: Number(args.get("--test") ?? DEFAULT_TEST_CANDLES),
    stepCandles: Number(args.get("--step") ?? DEFAULT_STEP_CANDLES),
    includeJev: (args.get("--include-jev") ?? "false").toLowerCase() === "true",
  };
}

export async function runWalkForward(options = getOptions()) {
  const {
    ativo,
    timeframe,
    candles: requestedCandles,
    initialTrainCandles,
    testCandles,
    stepCandles,
    includeJev,
  } = options;

  if (!["1h", "4h", "1d"].includes(timeframe)) throw new Error("Unsupported timeframe");
  if (![requestedCandles, initialTrainCandles, testCandles, stepCandles].every(Number.isInteger)) {
    throw new Error("Walk-forward parameters must be integers");
  }
  if (initialTrainCandles <= 0 || testCandles <= LOOKAHEAD_CANDLES || stepCandles <= 0) {
    throw new Error("Invalid walk-forward window parameters");
  }

  const klines = await getMarketData(ativo, timeframe, requestedCandles);
  if (klines.length < requestedCandles) {
    throw new Error(`Insufficient market_data: requested ${requestedCandles}, available ${klines.length}. Run the historical backfill first.`);
  }

  assertKlinesAvailableAsOf(
    klines,
    klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime,
  );
  freezeThresholds();

  const datasetHash = computeDatasetHash(klines);
  const walkForwardRunId = await createWalkForwardRun({
    ativo,
    timeframe,
    datasetStart: klines[0].openTime,
    datasetEnd: klines[klines.length - 1].openTime,
    candlesTotal: klines.length,
    datasetHash,
    initialTrainCandles,
    testCandles,
    stepCandles,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    executionModelVersion: EXECUTION_MODEL_VERSION,
    targetPct: TARGET_PCT,
    stopPct: STOP_PCT,
    slippagePct: DEFAULT_EXECUTION_COSTS.slippagePct,
    feePct: DEFAULT_EXECUTION_COSTS.feePct,
    thresholdFrozenAt: thresholds.frozenAt,
  });

  const indicatorsSeries = computeIndicatorsSeries(klines);
  const results: Record<string, unknown>[] = [];
  let foldNumber = 0;

  for (let testStart = initialTrainCandles; testStart + testCandles <= klines.length; testStart += stepCandles) {
    foldNumber += 1;
    const testEnd = testStart + testCandles - 1;
    const lastSignalIndex = testEnd - LOOKAHEAD_CANDLES;
    const trainStart = 0;
    const trainEnd = testStart - 1;
    if (lastSignalIndex < testStart) break;

    const candidates: Array<{ index: number; future: Kline[]; market: MarketState }> = [];
    for (let index = testStart; index <= lastSignalIndex; index += 1) {
      const indicators = indicatorsSeries[index];
      if (
        indicators.ema9 === null ||
        indicators.ema21 === null ||
        indicators.rsi === null ||
        indicators.atr === null ||
        indicators.vwap === null
      ) continue;
      candidates.push({
        index,
        future: klines.slice(index + 1, index + 1 + LOOKAHEAD_CANDLES),
        market: buildMarket(klines, indicatorsSeries, index),
      });
    }

    const baselineTrades: EvaluatedTrade[] = [];
    for (const candidate of candidates) {
      const decision = evaluateBaseline(candidate.market);
      if (decision.recomendacao === "WAIT") continue;
      const trade = simulateTrade(
        decision.recomendacao,
        klines[candidate.index],
        candidate.future,
        TARGET_PCT,
        STOP_PCT,
      );
      baselineTrades.push({ trade, exitIndex: candidate.index + trade.candlesHeld });
    }

    const baseline = summarize(baselineTrades);
    await saveWalkForwardFold({
      walkForwardRunId,
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      estrategia: "baseline",
      status: "ok",
      testSignals: candidates.length,
      totalTrades: baseline.totalTrades,
      closedTrades: baseline.closedTrades,
      openTrades: baseline.openTrades,
      winRate: baseline.winRate,
      profitFactor: baseline.profitFactor,
      totalProfitPercent: baseline.totalProfitPercent,
      avgProfitPercent: baseline.avgProfitPercent,
      expectancyPercent: baseline.expectancyPercent,
      maxDrawdownPercent: baseline.maxDrawdownPercent,
      grossTotalProfitPercent: baseline.grossTotalProfitPercent,
      totalFeePercent: baseline.totalFeePercent,
      totalSlippagePercent: baseline.totalSlippagePercent,
      avgCandlesHeld: baseline.avgCandlesHeld,
    });

    const buyHold = simulateBuyHold(klines, testStart, testEnd);
    const buyHoldSummary = summarize([buyHold]);
    await saveWalkForwardFold({
      walkForwardRunId,
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      estrategia: "buyhold",
      status: "ok",
      testSignals: 1,
      totalTrades: 1,
      closedTrades: 1,
      openTrades: 0,
      winRate: buyHoldSummary.winRate,
      profitFactor: buyHoldSummary.profitFactor,
      totalProfitPercent: buyHoldSummary.totalProfitPercent,
      avgProfitPercent: buyHoldSummary.avgProfitPercent,
      expectancyPercent: buyHoldSummary.expectancyPercent,
      maxDrawdownPercent: buyHoldSummary.maxDrawdownPercent,
      grossTotalProfitPercent: buyHoldSummary.grossTotalProfitPercent,
      totalFeePercent: buyHoldSummary.totalFeePercent,
      totalSlippagePercent: buyHoldSummary.totalSlippagePercent,
      avgCandlesHeld: buyHoldSummary.avgCandlesHeld,
    });

    let jevResult: StrategySummary | null = null;
    let jevNote = "Jev disabled for this run.";
    if (includeJev) {
      try {
        const decisions: Array<Awaited<ReturnType<typeof decideWithJev>>> = [];
        let next = 0;
        const worker = async () => {
          while (next < candidates.length) {
            const idx = next;
            next += 1;
            decisions[idx] = await decideWithJev(candidates[idx].market, "oos");
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));

        const jevTrades: EvaluatedTrade[] = [];
        for (let index = 0; index < candidates.length; index += 1) {
          const decision = decisions[index];
          if (decision.recomendacao === "WAIT") continue;
          const trade = simulateTrade(
            decision.recomendacao,
            klines[candidates[index].index],
            candidates[index].future,
            TARGET_PCT,
            STOP_PCT,
          );
          jevTrades.push({ trade, exitIndex: candidates[index].index + trade.candlesHeld });
        }
        jevResult = summarize(jevTrades);
        jevNote = "Jev evaluated on the same walk-forward fold.";
      } catch (error) {
        jevNote = error instanceof Error ? error.message : String(error);
      }
    }

    if (jevResult) {
      await saveWalkForwardFold({
        walkForwardRunId,
        foldNumber,
        trainStart: klines[trainStart].openTime,
        trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
        testStart: klines[testStart].openTime,
        testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
        estrategia: "jev",
        status: "ok",
        testSignals: candidates.length,
        totalTrades: jevResult.totalTrades,
        closedTrades: jevResult.closedTrades,
        openTrades: jevResult.openTrades,
        winRate: jevResult.winRate,
        profitFactor: jevResult.profitFactor,
        totalProfitPercent: jevResult.totalProfitPercent,
        avgProfitPercent: jevResult.avgProfitPercent,
        expectancyPercent: jevResult.expectancyPercent,
        maxDrawdownPercent: jevResult.maxDrawdownPercent,
        grossTotalProfitPercent: jevResult.grossTotalProfitPercent,
        totalFeePercent: jevResult.totalFeePercent,
        totalSlippagePercent: jevResult.totalSlippagePercent,
        avgCandlesHeld: jevResult.avgCandlesHeld,
        notas: jevNote,
      });
    } else {
      await saveWalkForwardFold({
        walkForwardRunId,
        foldNumber,
        trainStart: klines[trainStart].openTime,
        trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
        testStart: klines[testStart].openTime,
        testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
        estrategia: "jev",
        status: "unavailable",
        testSignals: candidates.length,
        notas: jevNote,
      });
    }

    results.push({
      foldNumber,
      trainStart: klines[trainStart].openTime,
      trainEnd: klines[trainEnd].closeTime ?? klines[trainEnd].openTime,
      testStart: klines[testStart].openTime,
      testEnd: klines[testEnd].closeTime ?? klines[testEnd].openTime,
      baseline,
      buyhold: buyHoldSummary,
      jev: jevResult ?? { status: "unavailable", notas: jevNote },
    });
  }

  return {
    walkForwardRunId,
    ativo,
    timeframe,
    candles: klines.length,
    datasetHash,
    initialTrainCandles,
    testCandles,
    stepCandles,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    foldCount: foldNumber,
    thresholdFrozenAt: thresholds.frozenAt,
    results: await getWalkForwardFolds(walkForwardRunId),
    note: "Fixed-rule walk-forward validation: no parameter fitting is performed in this stage.",
  };
}


if (import.meta.url === new URL(process.argv[1], "file:").href) {
  runWalkForward().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
