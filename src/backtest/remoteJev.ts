import { computeIndicatorsSeries } from "../features/indicators.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { simulateTrade, DEFAULT_EXECUTION_COSTS, EXECUTION_MODEL_VERSION } from "../papertrading/simulator.js";
import {
  createBacktestRun,
  getBacktestRun,
  getMarketDataRange,
  saveSignal,
  saveTrade,
  saveDecisionLog,
  settleDecisionLog,
} from "../db/repository.js";
import { assertDatasetMatchesMetadata, computeDatasetHash } from "../marketdata/dataset.js";
import { assertKlinesAvailableAsOf } from "../marketdata/pointInTime.js";
import { freezeThresholds } from "../config/thresholds.js";
import { resolvePriceLevels } from "../config/executionLevels.js";
import type { MarketState, Kline, DecisionResult } from "../types.js";

const LOOKAHEAD_CANDLES = 20;
const OOS_START_RATIO = 0.7;
const CONCURRENCY = 2;


function forwardOutcome(signalPrice: number, future: Kline[]) {
  const finalPrice = future[future.length - 1]?.close ?? signalPrice;
  const delta = ((finalPrice - signalPrice) / signalPrice) * 100;
  return {
    forwardReturnPercent: delta,
    outcomeDirection: delta > 0 ? "up" as const : delta < 0 ? "down" as const : "flat" as const,
  };
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

export async function runRemoteJevBacktest(fromRunId: number) {
  freezeThresholds();

  const runRecord = await getBacktestRun(fromRunId);
  if (!runRecord) throw new Error(`Run ${fromRunId} não encontrado no banco de dados`);
  if (runRecord.ativo !== "BTCUSDT" || runRecord.timeframe !== "1h") {
    throw new Error(`Run ${fromRunId} não é compatível com o backtest Jev remoto`);
  }

  const klines = await getMarketDataRange(
    runRecord.ativo,
    runRecord.timeframe,
    runRecord.periodoInicio,
    runRecord.periodoFim,
  );
  if (klines.length === 0) {
    throw new Error(`Nenhum candle encontrado para reproduzir o run ${fromRunId}`);
  }
  assertDatasetMatchesMetadata(klines, runRecord.candlesTotal, runRecord.datasetHash);

  const datasetAsOf = klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime;
  assertKlinesAvailableAsOf(klines, datasetAsOf);
  const datasetHash = computeDatasetHash(klines);
  const indicatorsSeries = computeIndicatorsSeries(klines);
  const evaluationStart = Math.floor(klines.length * OOS_START_RATIO);

  const runId = await createBacktestRun({
    engine: "jev",
    mode: "oos",
    ativo: "BTCUSDT",
    timeframe: "1h",
    periodoInicio: klines[0].openTime,
    periodoFim: klines[klines.length - 1].openTime,
    oosStartRatio: OOS_START_RATIO,
    thresholdsCongeladosEm: new Date(),
    candlesTotal: klines.length,
    datasetHash,
    executionModelVersion: EXECUTION_MODEL_VERSION,
    targetPct: execution.execution.targetPct,
        stopPct: execution.execution.stopPct,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    slippagePct: DEFAULT_EXECUTION_COSTS.slippagePct,
    feePct: DEFAULT_EXECUTION_COSTS.feePct,
  });

  const candidates: Array<{
    signalCandle: Kline;
    future: Kline[];
    market: MarketState;
  }> = [];

  let skippedWarmup = 0;

  for (let i = evaluationStart; i < klines.length - 1; i++) {
    const indicators = indicatorsSeries[i];
    if (
      indicators.ema9 === null ||
      indicators.ema21 === null ||
      indicators.rsi === null ||
      indicators.atr === null ||
      indicators.vwap === null
    ) {
      skippedWarmup++;
      continue;
    }

    const future = klines.slice(i + 1, i + 1 + LOOKAHEAD_CANDLES);
    if (future.length === 0) continue;

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

  const decisions = await mapWithConcurrency(
    candidates,
    async (candidate) => decideWithJev(candidate.market, "oos"),
    CONCURRENCY,
  );

  let savedTrades = 0;
  let closedTrades = 0;
  let openTrades = 0;
  let waitSignals = 0;

  for (let i = 0; i < candidates.length; i++) {
    const decision: DecisionResult = decisions[i];
    const candidate = candidates[i];
    const decisionAt = candidate.signalCandle.closeTime ?? candidate.signalCandle.openTime;
    const decisionLogId = await saveDecisionLog({
      backtestRunId: runId,
      ativo: "BTCUSDT",
      timeframe: "1h",
      decisionAt,
      dataAsOf: decisionAt,
      decision,
      referencePrice: candidate.signalCandle.close,
      targetPct: execution.execution.targetPct,
        stopPct: execution.execution.stopPct,
      lookaheadCandles: LOOKAHEAD_CANDLES,
      executionModelVersion: EXECUTION_MODEL_VERSION,
    });

    if (decision.recomendacao === "WAIT") {
      waitSignals++;
      const forward = forwardOutcome(candidate.signalCandle.close, candidate.future);
      await settleDecisionLog(decisionLogId, {
        outcomeStatus: "settled",
        outcomeDirection: forward.outcomeDirection,
        forwardReturnPercent: forward.forwardReturnPercent,
        evaluatedAt: candidate.future[candidate.future.length - 1]?.closeTime
          ?? candidate.future[candidate.future.length - 1]?.openTime
          ?? decisionAt,
      });
      continue;
    }

    const trade = simulateTrade(
      decision.recomendacao,
      candidate.signalCandle,
      candidate.future,
        execution.execution.targetPct,
        execution.execution.stopPct,
      );
    const levels = resolvePriceLevels({ entryPrice: trade.entryPrice, side: decision.recomendacao === "SELL" ? "SELL" : "BUY", atr: indicators.atr, timeframe: "1h", referencePrice: signalCandle.close }).levels;
    const signalId = await saveSignal(
      "BTCUSDT",
      "1h",
      decision,
      levels,
      runId,
    );
    await saveTrade(
      signalId,
      trade.entryPrice,
      trade.exitPrice,
      trade.outcome,
      trade.profitPercent,
      {
        openedAt: candidate.signalCandle.closeTime ?? candidate.signalCandle.openTime,
        closedAt: trade.outcome === "open"
          ? null
          : candidate.future[trade.candlesHeld - 1]?.closeTime
            ?? candidate.future[trade.candlesHeld - 1]?.openTime
            ?? null,
        grossProfitPercent: trade.grossProfitPercent,
        feePercent: trade.feePercent,
        slippagePercent: trade.slippagePercent,
        candlesHeld: trade.candlesHeld,
        executionModelVersion: EXECUTION_MODEL_VERSION,
        exitReason: trade.exitReason,
        maxFavorableExcursionPercent: trade.maxFavorableExcursionPct,
        maxAdverseExcursionPercent: trade.maxAdverseExcursionPct,
      },
    );

    const forward = forwardOutcome(candidate.signalCandle.close, candidate.future);
    await settleDecisionLog(decisionLogId, {
      outcomeStatus: "settled",
      outcomeDirection: forward.outcomeDirection,
      forwardReturnPercent: forward.forwardReturnPercent,
      tradeProfitPercent: trade.profitPercent,
      exitReason: trade.exitReason,
      evaluatedAt: candidate.future[trade.candlesHeld - 1]?.closeTime
        ?? candidate.future[trade.candlesHeld - 1]?.openTime
        ?? decisionAt,
    });

    savedTrades++;
    if (trade.outcome === "open") openTrades++;
    else closedTrades++;
  }

  return {
    runId,
    sourceRunId: fromRunId,
    engine: "jev",
    mode: "oos",
    asset: "BTCUSDT",
    timeframe: "1h",
    candles: klines.length,
    datasetHash,
    evaluationCandidates: candidates.length,
    skippedWarmup,
    waitSignals,
    trades: savedTrades,
    closedTrades,
    openTrades,
    concurrency: CONCURRENCY,
  };
}
