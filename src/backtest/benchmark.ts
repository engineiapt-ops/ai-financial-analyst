import { computeIndicatorsSeries } from "../features/indicators.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import {
  createBenchmarkRun,
  getBacktestRun,
  getMarketDataRange,
  saveBenchmarkResult,
  getBenchmarkResults,
} from "../db/repository.js";
import {
  DEFAULT_EXECUTION_COSTS,
  EXECUTION_MODEL_VERSION,
  simulateTrade,
  type TradeOutcome,
} from "../papertrading/simulator.js";
import { assertDatasetMatchesMetadata, computeDatasetHash } from "../marketdata/dataset.js";
import { assertKlinesAvailableAsOf } from "../marketdata/pointInTime.js";
import { freezeThresholds } from "../config/thresholds.js";
import { resolveExecutionLevels } from "../config/executionLevels.js";
import type { DecisionResult, Kline, MarketState } from "../types.js";

const LOOKAHEAD_CANDLES = 20;
const OOS_START_RATIO = 0.7;
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

function summarizeTrades(entries: EvaluatedTrade[]): StrategySummary {
  const ordered = [...entries].sort((a, b) => a.exitIndex - b.exitIndex);
  const closed = ordered.filter((entry) => entry.trade.outcome !== "open");
  const wins = closed.filter((entry) => entry.trade.outcome === "win");
  const gross = closed.reduce((sum, entry) => sum + entry.trade.grossProfitPercent, 0);
  const net = closed.reduce((sum, entry) => sum + entry.trade.profitPercent, 0);
  const positive = closed.reduce((sum, entry) => sum + Math.max(0, entry.trade.profitPercent), 0);
  const negative = closed.reduce((sum, entry) => sum + Math.min(0, entry.trade.profitPercent), 0);

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
    profitFactor: negative < 0 ? positive / Math.abs(negative) : null,
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

function forwardDirection(price: number, future: Kline[]): "up" | "down" | "flat" {
  const finalPrice = future[future.length - 1]?.close ?? price;
  if (finalPrice > price) return "up";
  if (finalPrice < price) return "down";
  return "flat";
}

function buildCandidates(klines: Kline[]) {
  const indicatorsSeries = computeIndicatorsSeries(klines);
  const evaluationStart = Math.floor(klines.length * OOS_START_RATIO);
  const candidates: Array<{ signalCandle: Kline; future: Kline[]; market: MarketState }> = [];

  for (let i = evaluationStart; i < klines.length - 1; i += 1) {
    const indicators = indicatorsSeries[i];
    if (
      indicators.ema9 === null ||
      indicators.ema21 === null ||
      indicators.rsi === null ||
      indicators.atr === null ||
      indicators.vwap === null
    ) continue;

    const future = klines.slice(i + 1, i + 1 + LOOKAHEAD_CANDLES);
    if (!future.length) continue;

    const signalCandle = klines[i];
    candidates.push({
      signalCandle,
      future,
      market: {
        ativo: "BTCUSDT",
        timeframe: "1h",
        timestamp: (signalCandle.closeTime ?? signalCandle.openTime).getTime(),
        dataAsOf: (signalCandle.closeTime ?? signalCandle.openTime).getTime(),
        precoAtual: signalCandle.close,
        indicators,
        noticiaSentimento: 0,
      },
    });
  }
  return candidates;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function consume() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => consume()),
  );
  return results;
}

function simulateBuyHold(klines: Kline[]): TradeOutcome {
  const startIndex = Math.floor(klines.length * OOS_START_RATIO);
  const oos = klines.slice(startIndex);
  if (oos.length < 2) throw new Error("Dataset insuficiente para Buy & Hold");

  const first = oos[0];
  const last = oos[oos.length - 1];
  const signalPrice = first.close;
  const entryPrice = signalPrice * (1 + DEFAULT_EXECUTION_COSTS.slippagePct);
  const exitRaw = last.close;
  const exitPrice = exitRaw * (1 - DEFAULT_EXECUTION_COSTS.slippagePct);

  const grossProfitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  const feePercent =
    DEFAULT_EXECUTION_COSTS.feePct * 2 * 100;
  const profitPercent = grossProfitPercent - feePercent;
  const slippagePercent =
    (Math.abs(signalPrice - entryPrice) / signalPrice +
      Math.abs(exitRaw - exitPrice) / exitRaw) * 100;

  let maxFavorableExcursionPct = 0;
  let maxAdverseExcursionPct = 0;
  let peakEquity = 1;
  let maxDrawdown = 0;

  for (const candle of oos) {
    const equity = (candle.close / entryPrice) * (1 - DEFAULT_EXECUTION_COSTS.feePct);
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, (peakEquity - equity) * 100);
    maxFavorableExcursionPct = Math.max(
      maxFavorableExcursionPct,
      ((candle.high - entryPrice) / entryPrice) * 100,
    );
    maxAdverseExcursionPct = Math.min(
      maxAdverseExcursionPct,
      ((candle.low - entryPrice) / entryPrice) * 100,
    );
  }

  return {
    signalPrice,
    entryPrice,
    exitPrice,
    outcome: profitPercent >= 0 ? "win" : "loss",
    profitPercent,
    grossProfitPercent,
    feePercent,
    slippagePercent,
    candlesHeld: oos.length - 1,
    exitReason: "end",
    targetPrice: entryPrice,
    stopPrice: entryPrice,
    maxFavorableExcursionPct,
    maxAdverseExcursionPct,
  };
}

export async function runBenchmarkSuite(
  fromRunId: number,
  includeJev = true,
) {
  const sourceRun = await getBacktestRun(fromRunId);
  if (!sourceRun) throw new Error(`Run ${fromRunId} não encontrado no banco de dados`);
  if (sourceRun.ativo !== "BTCUSDT" || sourceRun.timeframe !== "1h") {
    throw new Error(`Run ${fromRunId} não é compatível com o benchmark atual`);
  }

  const klines = await getMarketDataRange(
    sourceRun.ativo,
    sourceRun.timeframe,
    sourceRun.periodoInicio,
    sourceRun.periodoFim,
  );
  if (!klines.length) throw new Error("Nenhum candle disponível para benchmark");

  assertDatasetMatchesMetadata(klines, sourceRun.candlesTotal, sourceRun.datasetHash);
  const datasetAsOf = klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime;
  assertKlinesAvailableAsOf(klines, datasetAsOf);
  freezeThresholds();

  const benchmarkRunId = await createBenchmarkRun({
    sourceRunId: fromRunId,
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: klines[0].openTime,
    periodoFim: klines[klines.length - 1].openTime,
    oosStartRatio: OOS_START_RATIO,
    candlesTotal: klines.length,
    datasetHash: computeDatasetHash(klines),
    executionModelVersion: EXECUTION_MODEL_VERSION,
    targetPct: TARGET_PCT,
    stopPct: STOP_PCT,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    slippagePct: DEFAULT_EXECUTION_COSTS.slippagePct,
    feePct: DEFAULT_EXECUTION_COSTS.feePct,
  });

  const candidates = buildCandidates(klines);

  const baselineTrades: EvaluatedTrade[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const decision = evaluateBaseline(candidate.market);
    if (decision.recomendacao === "WAIT") continue;
    const trade = simulateTrade(
      decision.recomendacao,
      candidate.signalCandle,
      candidate.future,
      resolveExecutionLevels({ price: candidate.signalCandle.close, atr: candidate.market.indicators.atr, timeframe: candidate.market.timeframe }).targetPct,
      resolveExecutionLevels({ price: candidate.signalCandle.close, atr: candidate.market.indicators.atr, timeframe: candidate.market.timeframe }).stopPct,
    );
    baselineTrades.push({
      trade,
      exitIndex: index + trade.candlesHeld,
    });
  }

  const baselineSummary = summarizeTrades(baselineTrades);
  await saveBenchmarkResult({
    benchmarkRunId,
    estrategia: "baseline",
    ...{
      totalTrades: baselineSummary.totalTrades,
      closedTrades: baselineSummary.closedTrades,
      openTrades: baselineSummary.openTrades,
      winRate: baselineSummary.winRate,
      profitFactor: baselineSummary.profitFactor,
      totalProfitPercent: baselineSummary.totalProfitPercent,
      avgProfitPercent: baselineSummary.avgProfitPercent,
      expectancyPercent: baselineSummary.expectancyPercent,
      maxDrawdownPercent: baselineSummary.maxDrawdownPercent,
      grossTotalProfitPercent: baselineSummary.grossTotalProfitPercent,
      totalFeePercent: baselineSummary.totalFeePercent,
      totalSlippagePercent: baselineSummary.totalSlippagePercent,
      avgCandlesHeld: baselineSummary.avgCandlesHeld,
    },
    status: "ok",
  });

  const buyHold = simulateBuyHold(klines);
  const buyHoldSummary = summarizeTrades([{ trade: buyHold, exitIndex: klines.length }]);
  await saveBenchmarkResult({
    benchmarkRunId,
    estrategia: "buyhold",
    ...{
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
    },
    status: "ok",
    notas: `Buy & Hold OOS com entrada no primeiro candle e saída no último candle; horizonte=${klines.length - Math.floor(klines.length * OOS_START_RATIO)} candles.`,
  });

  let jevStatus: "ok" | "unavailable" | "error" = "unavailable";
  let jevNotes = "Jev desativado no benchmark.";

  if (includeJev) {
    try {
      const decisions = await mapWithConcurrency(
        candidates,
        async (candidate) => decideWithJev(candidate.market, "oos"),
        CONCURRENCY,
      );
      const jevTrades: EvaluatedTrade[] = candidates.flatMap((candidate, index) => {
        const decision = decisions[index];
        if (decision.recomendacao === "WAIT") return [];
        const trade = simulateTrade(
          decision.recomendacao,
          candidate.signalCandle,
          candidate.future,
      resolveExecutionLevels({ price: candidate.signalCandle.close, atr: candidate.market.indicators.atr, timeframe: candidate.market.timeframe }).targetPct,
      resolveExecutionLevels({ price: candidate.signalCandle.close, atr: candidate.market.indicators.atr, timeframe: candidate.market.timeframe }).stopPct,
        );
        return [{ trade, exitIndex: index + trade.candlesHeld }];
      });
      const summary = summarizeTrades(jevTrades);
      await saveBenchmarkResult({
        benchmarkRunId,
        estrategia: "jev",
        totalTrades: summary.totalTrades,
        closedTrades: summary.closedTrades,
        openTrades: summary.openTrades,
        winRate: summary.winRate,
        profitFactor: summary.profitFactor,
        totalProfitPercent: summary.totalProfitPercent,
        avgProfitPercent: summary.avgProfitPercent,
        expectancyPercent: summary.expectancyPercent,
        maxDrawdownPercent: summary.maxDrawdownPercent,
        grossTotalProfitPercent: summary.grossTotalProfitPercent,
        totalFeePercent: summary.totalFeePercent,
        totalSlippagePercent: summary.totalSlippagePercent,
        avgCandlesHeld: summary.avgCandlesHeld,
        status: "ok",
      });
      jevStatus = "ok";
      jevNotes = "Jev avaliado no mesmo dataset OOS e com o mesmo modelo de execução.";
    } catch (error) {
      jevStatus = "unavailable";
      jevNotes = error instanceof Error ? error.message : String(error);
      await saveBenchmarkResult({
        benchmarkRunId,
        estrategia: "jev",
        status: "unavailable",
        notas: jevNotes,
      });
    }
  } else {
    await saveBenchmarkResult({
      benchmarkRunId,
      estrategia: "jev",
      status: "unavailable",
      notas: jevNotes,
    });
  }

  return {
    benchmarkRunId,
    sourceRunId: fromRunId,
    asset: "BTCUSDT",
    timeframe: "1h",
    candles: klines.length,
    datasetHash: computeDatasetHash(klines),
    oosStartRatio: OOS_START_RATIO,
    executionModelVersion: EXECUTION_MODEL_VERSION,
    strategies: ["baseline", "buyhold", "jev"],
    jevStatus,
    candidates: candidates.length,
    results: await getBenchmarkResults(benchmarkRunId),
  };
}
