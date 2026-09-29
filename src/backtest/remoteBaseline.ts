import { computeIndicatorsSeries } from "../features/indicators.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { simulateTrade, DEFAULT_EXECUTION_COSTS, EXECUTION_MODEL_VERSION } from "../papertrading/simulator.js";
import {
  createBacktestRun,
  getBacktestRun,
  getMarketDataRange,
  getMarketData,
  saveSignal,
  saveTrade,
  saveDecisionLog,
  settleDecisionLog,
} from "../db/repository.js";
import { assertDatasetMatchesMetadata, computeDatasetHash } from "../marketdata/dataset.js";
import { assertKlinesAvailableAsOf } from "../marketdata/pointInTime.js";
import { freezeThresholds } from "../config/thresholds.js";
import { FALLBACK_STOP_PCT, FALLBACK_TARGET_PCT, resolvePriceLevels } from "../config/executionLevels.js";
import type { MarketState, Kline } from "../types.js";

const LOOKAHEAD_CANDLES = 20;
const OOS_START_RATIO = 0.7;

function forwardOutcome(signalPrice: number, future: Kline[]) {
  const finalPrice = future[future.length - 1]?.close ?? signalPrice;
  const delta = ((finalPrice - signalPrice) / signalPrice) * 100;
  return {
    forwardReturnPercent: delta,
    outcomeDirection: delta > 0 ? "up" as const : delta < 0 ? "down" as const : "flat" as const,
  };
}

export async function runRemoteBaselineBacktest(fromRunId?: number, requestedCandles = 5000) {
  freezeThresholds();

  const sourceRun = fromRunId ? await getBacktestRun(fromRunId) : null;
  if (fromRunId && !sourceRun) throw new Error(`Run ${fromRunId} não encontrado no banco de dados`);
  if (sourceRun && (sourceRun.ativo !== "BTCUSDT" || sourceRun.timeframe !== "1h")) {
    throw new Error(`Run ${fromRunId} não é compatível com o backtest baseline remoto`);
  }

  const klines = sourceRun
    ? await getMarketDataRange(sourceRun.ativo, sourceRun.timeframe, sourceRun.periodoInicio, sourceRun.periodoFim)
    : await getMarketData("BTCUSDT", "1h", requestedCandles);

  if (!klines.length) throw new Error("Nenhum candle encontrado para o backtest baseline");
  if (sourceRun) {
    assertDatasetMatchesMetadata(klines, sourceRun.candlesTotal, sourceRun.datasetHash);
  }

  const datasetAsOf = klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime;
  assertKlinesAvailableAsOf(klines, datasetAsOf);
  const datasetHash = computeDatasetHash(klines);
  const indicatorsSeries = computeIndicatorsSeries(klines);
  const evaluationStart = Math.floor(klines.length * OOS_START_RATIO);

  const runId = await createBacktestRun({
    engine: "baseline",
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
    targetPct: FALLBACK_TARGET_PCT,
    stopPct: FALLBACK_STOP_PCT,
    lookaheadCandles: LOOKAHEAD_CANDLES,
    slippagePct: DEFAULT_EXECUTION_COSTS.slippagePct,
    feePct: DEFAULT_EXECUTION_COSTS.feePct,
  });

  let candidates = 0;
  let waitSignals = 0;
  let savedTrades = 0;
  let closedTrades = 0;
  let openTrades = 0;

  for (let i = evaluationStart; i < klines.length - 1; i += 1) {
    const signalCandle = klines[i];
    const indicators = indicatorsSeries[i];
    const future = klines.slice(i + 1, i + 1 + LOOKAHEAD_CANDLES);
    if (
      indicators.ema9 === null ||
      indicators.ema21 === null ||
      indicators.rsi === null ||
      indicators.atr === null ||
      indicators.vwap === null ||
      !future.length
    ) {
      continue;
    }

    candidates += 1;
    const decisionAt = signalCandle.closeTime ?? signalCandle.openTime;
    const market: MarketState = {
      ativo: "BTCUSDT",
      timeframe: "1h",
      timestamp: decisionAt.getTime(),
      dataAsOf: decisionAt.getTime(),
      precoAtual: signalCandle.close,
      indicators,
      noticiaSentimento: 0,
    };
    const decision = evaluateBaseline(market);
    const execution = resolvePriceLevels({
      entryPrice: signalCandle.close,
      side: decision.recomendacao === "SELL" ? "SELL" : "BUY",
      atr: indicators.atr,
      timeframe: "1h",
    });
    const decisionLogId = await saveDecisionLog({
      backtestRunId: runId,
      ativo: "BTCUSDT",
      timeframe: "1h",
      decisionAt,
      dataAsOf: decisionAt,
      decision,
      referencePrice: signalCandle.close,
      targetPct: execution.execution.targetPct,
      stopPct: execution.execution.stopPct,
      lookaheadCandles: LOOKAHEAD_CANDLES,
      executionModelVersion: EXECUTION_MODEL_VERSION,
    });

    if (decision.recomendacao === "WAIT") {
      waitSignals += 1;
      const forward = forwardOutcome(signalCandle.close, future);
      await settleDecisionLog(decisionLogId, {
        outcomeStatus: "settled",
        outcomeDirection: forward.outcomeDirection,
        forwardReturnPercent: forward.forwardReturnPercent,
        evaluatedAt: future[future.length - 1]?.closeTime ?? future[future.length - 1]?.openTime ?? decisionAt,
      });
      continue;
    }

    const trade = simulateTrade(
      decision.recomendacao,
      signalCandle,
      future,
        execution.execution.targetPct,
        execution.execution.stopPct,
      );
    const levels = resolvePriceLevels({
      entryPrice: trade.entryPrice,
      side: decision.recomendacao === "SELL" ? "SELL" : "BUY",
      atr: indicators.atr,
      timeframe: "1h",
      referencePrice: signalCandle.close,
    }).levels;
    const signalId = await saveSignal("BTCUSDT", "1h", decision, levels, runId);

    await saveTrade(
      signalId,
      trade.entryPrice,
      trade.exitPrice,
      trade.outcome,
      trade.profitPercent,
      {
        openedAt: decisionAt,
        closedAt: trade.outcome === "open"
          ? null
          : future[trade.candlesHeld - 1]?.closeTime ?? future[trade.candlesHeld - 1]?.openTime ?? null,
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

    const forward = forwardOutcome(signalCandle.close, future);
    await settleDecisionLog(decisionLogId, {
      outcomeStatus: "settled",
      outcomeDirection: forward.outcomeDirection,
      forwardReturnPercent: forward.forwardReturnPercent,
      tradeProfitPercent: trade.profitPercent,
      exitReason: trade.exitReason,
      evaluatedAt: future[trade.candlesHeld - 1]?.closeTime ?? future[trade.candlesHeld - 1]?.openTime ?? decisionAt,
    });

    savedTrades += 1;
    if (trade.outcome === "open") openTrades += 1;
    else closedTrades += 1;
  }

  return {
    runId,
    sourceRunId: fromRunId ?? null,
    engine: "baseline",
    mode: "oos",
    asset: "BTCUSDT",
    timeframe: "1h",
    candles: klines.length,
    datasetHash,
    evaluationCandidates: candidates,
    waitSignals,
    trades: savedTrades,
    closedTrades,
    openTrades,
  };
}
