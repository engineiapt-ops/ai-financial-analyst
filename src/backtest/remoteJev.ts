import { computeIndicatorsSeries } from "../features/indicators.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { simulateTrade } from "../papertrading/simulator.js";
import {
  createBacktestRun,
  getBacktestRun,
  getMarketDataRange,
  saveSignal,
  saveTrade,
} from "../db/repository.js";
import { assertDatasetMatchesMetadata, computeDatasetHash } from "../marketdata/dataset.js";
import { assertKlinesAvailableAsOf } from "../marketdata/pointInTime.js";
import { freezeThresholds } from "../config/thresholds.js";
import type { MarketState, Kline, DecisionResult } from "../types.js";

const TARGET_PCT = 0.01;
const STOP_PCT = 0.005;
const LOOKAHEAD_CANDLES = 20;
const OOS_START_RATIO = 0.7;
const CONCURRENCY = 8;

function getLevels(entryPrice: number, side: "BUY" | "SELL") {
  const direction = side === "BUY" ? 1 : -1;
  return {
    entrada: entryPrice,
    alvo: entryPrice * (1 + direction * TARGET_PCT),
    stop: entryPrice * (1 - direction * STOP_PCT),
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
    if (decision.recomendacao === "WAIT") {
      waitSignals++;
      continue;
    }

    const candidate = candidates[i];
    const trade = simulateTrade(
      decision.recomendacao,
      candidate.signalCandle,
      candidate.future,
      TARGET_PCT,
      STOP_PCT,
    );
    const levels = getLevels(trade.entryPrice, decision.recomendacao);
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
      { openedAt: candidate.signalCandle.openTime },
    );

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
