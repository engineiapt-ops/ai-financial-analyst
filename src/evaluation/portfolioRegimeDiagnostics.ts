import {
  getMarketDataRange,
  getWalkForwardFolds,
  getWalkForwardRun,
} from "../db/repository.js";
import { assertDatasetMatchesMetadata } from "../marketdata/dataset.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import {
  calibrateRegimeThresholds,
  classifyRegime,
  type RegimeSnapshot,
} from "../risk/regime.js";
import { evaluateRiskV2 } from "../risk/riskEngine.js";
import {
  simulateTrade,
  type TradeOutcome,
} from "../papertrading/simulator.js";

export const PORTFOLIO_REGIME_DIAGNOSTICS_VERSION =
  "portfolio-regime-diagnostics.v1";

interface RegimeBucket {
  regime: string;
  candles: number;
  signals: number;
  riskBlockedSignals: number;
  allowedSignals: number;
  blockedWins: number;
  blockedLosses: number;
  allowedWins: number;
  allowedLosses: number;
  blockedNetSignalPct: number;
  allowedNetSignalPct: number;
}

function newBucket(regime: RegimeSnapshot): RegimeBucket {
  return {
    regime: regime.key,
    candles: 0,
    signals: 0,
    riskBlockedSignals: 0,
    allowedSignals: 0,
    blockedWins: 0,
    blockedLosses: 0,
    allowedWins: 0,
    allowedLosses: 0,
    blockedNetSignalPct: 0,
    allowedNetSignalPct: 0,
  };
}

function bucketFor(
  map: Map<string, RegimeBucket>,
  regime: RegimeSnapshot,
): RegimeBucket {
  const existing = map.get(regime.key);
  if (existing) return existing;
  const created = newBucket(regime);
  map.set(regime.key, created);
  return created;
}

function dimensionBucket(
  map: Map<string, RegimeBucket>,
  key: string,
): RegimeBucket {
  const existing = map.get(key);
  if (existing) return existing;
  const created: RegimeBucket = {
    regime: key,
    candles: 0,
    signals: 0,
    riskBlockedSignals: 0,
    allowedSignals: 0,
    blockedWins: 0,
    blockedLosses: 0,
    allowedWins: 0,
    allowedLosses: 0,
    blockedNetSignalPct: 0,
    allowedNetSignalPct: 0,
  };
  map.set(key, created);
  return created;
}

function recordOutcome(
  bucket: RegimeBucket,
  blocked: boolean,
  trade: TradeOutcome,
) {
  bucket.signals += 1;
  if (blocked) {
    bucket.riskBlockedSignals += 1;
    bucket.blockedNetSignalPct += trade.profitPercent;
    if (trade.outcome === "win") bucket.blockedWins += 1;
    if (trade.outcome === "loss") bucket.blockedLosses += 1;
    return;
  }

  bucket.allowedSignals += 1;
  bucket.allowedNetSignalPct += trade.profitPercent;
  if (trade.outcome === "win") bucket.allowedWins += 1;
  if (trade.outcome === "loss") bucket.allowedLosses += 1;
}

function serializeBuckets(map: Map<string, RegimeBucket>) {
  return [...map.values()]
    .sort((a, b) => a.regime.localeCompare(b.regime))
    .map((bucket) => ({
      ...bucket,
      blockedSignalWinRatePct:
        bucket.riskBlockedSignals > 0
          ? (bucket.blockedWins / bucket.riskBlockedSignals) * 100
          : null,
      allowedSignalWinRatePct:
        bucket.allowedSignals > 0
          ? (bucket.allowedWins / bucket.allowedSignals) * 100
          : null,
    }));
}

export async function buildPortfolioRegimeDiagnostics(
  walkForwardRunId: number,
) {
  const sourceRun = await getWalkForwardRun(walkForwardRunId);
  if (!sourceRun) {
    throw new Error(`Walk-forward Run ${walkForwardRunId} not found`);
  }

  const folds = await getWalkForwardFolds(walkForwardRunId);
  const baselineFolds = folds
    .filter((fold) => fold.estrategia === "baseline")
    .sort((a, b) => Number(a.fold_number) - Number(b.fold_number));

  if (!baselineFolds.length) {
    throw new Error(
      `Walk-forward Run ${walkForwardRunId} has no baseline folds`,
    );
  }

  const klines = await getMarketDataRange(
    sourceRun.ativo,
    sourceRun.timeframe,
    sourceRun.datasetStart,
    sourceRun.datasetEnd,
  );
  assertDatasetMatchesMetadata(
    klines,
    sourceRun.candlesTotal,
    sourceRun.datasetHash,
  );

  const indicatorsSeries = computeIndicatorsSeries(klines);
  const byCombined = new Map<string, RegimeBucket>();
  const byTrend = new Map<string, RegimeBucket>();
  const byVolatility = new Map<string, RegimeBucket>();
  const byMomentum = new Map<string, RegimeBucket>();

  let totalSignals = 0;
  let totalRiskBlocks = 0;
  let totalBlockedWins = 0;
  let totalBlockedLosses = 0;

  const foldDiagnostics: Array<{
    foldNumber: number;
    testStart: string;
    testEnd: string;
    calibrationCandles: number;
    riskGateBlocks: number;
    signals: number;
  }> = [];

  for (const fold of baselineFolds) {
    const testStart = new Date(fold.test_start);
    const testEnd = new Date(fold.test_end);

    const testStartIndex = klines.findIndex(
      (candle) =>
        (candle.closeTime ?? candle.openTime).getTime() >= testStart.getTime(),
    );
    const testEndIndex = klines.findIndex(
      (candle) =>
        (candle.closeTime ?? candle.openTime).getTime() >= testEnd.getTime(),
    );

    if (testStartIndex < 1 || testEndIndex <= testStartIndex) {
      throw new Error(`Invalid fold boundaries for fold ${fold.fold_number}`);
    }

    const trainKlines = klines.slice(0, testStartIndex);
    const thresholds = calibrateRegimeThresholds(
      trainKlines,
      trainKlines.length,
      klines[testStartIndex - 1].closeTime ??
        klines[testStartIndex - 1].openTime,
    );

    const regimeSeries = klines.map((candle, index) =>
      classifyRegime(candle, indicatorsSeries[index], thresholds),
    );

    let foldSignals = 0;
    let foldRiskBlocks = 0;

    for (
      let index = testStartIndex;
      index <= testEndIndex - sourceRun.lookaheadCandles;
      index += 1
    ) {
      const indicators = indicatorsSeries[index];
      if (
        indicators.ema9 === null ||
        indicators.ema21 === null ||
        indicators.rsi === null ||
        indicators.atr === null ||
        indicators.vwap === null
      ) {
        continue;
      }

      const candle = klines[index];
      const regime = regimeSeries[index];
      const decision = evaluateBaseline({
        ativo: sourceRun.ativo,
        timeframe: sourceRun.timeframe,
        timestamp: (candle.closeTime ?? candle.openTime).getTime(),
        dataAsOf: (candle.closeTime ?? candle.openTime).getTime(),
        precoAtual: candle.close,
        indicators,
        noticiaSentimento: 0,
      });

      if (decision.recomendacao === "WAIT") continue;

      const future = klines.slice(
        index + 1,
        index + 1 + sourceRun.lookaheadCandles,
      );

      const trade = simulateTrade(
        decision.recomendacao,
        candle,
        future,
        sourceRun.targetPct,
        sourceRun.stopPct,
      );

      const risk = evaluateRiskV2({
        decision,
        regime,
        state: {
          equity: 1000,
          dailyLossPct: 0,
          tradesToday: 0,
          openPositions: 0,
          grossExposurePct: 0,
          consecutiveLosses: 0,
        },
        stopDistancePct: sourceRun.stopPct * 100,
      });
      const blocked = !risk.allowed && risk.reason === "high_volatility";

      const combined = bucketFor(byCombined, regime);
      const trend = dimensionBucket(byTrend, regime.trend);
      const volatility = dimensionBucket(byVolatility, regime.volatility);
      const momentum = dimensionBucket(byMomentum, regime.momentum);

      for (const bucket of [combined, trend, volatility, momentum]) {
        bucket.candles += 0;
      }

      recordOutcome(combined, blocked, trade);
      recordOutcome(trend, blocked, trade);
      recordOutcome(volatility, blocked, trade);
      recordOutcome(momentum, blocked, trade);

      foldSignals += 1;
      totalSignals += 1;
      if (blocked) {
        foldRiskBlocks += 1;
        totalRiskBlocks += 1;
        if (trade.outcome === "win") totalBlockedWins += 1;
        if (trade.outcome === "loss") totalBlockedLosses += 1;
      }
    }

    for (let index = testStartIndex; index <= testEndIndex; index += 1) {
      const regime = regimeSeries[index];
      byCombined.get(regime.key)!.candles += 1;
      byTrend.get(regime.trend)!.candles += 1;
      byVolatility.get(regime.volatility)!.candles += 1;
      byMomentum.get(regime.momentum)!.candles += 1;
    }

    foldDiagnostics.push({
      foldNumber: Number(fold.fold_number),
      testStart: testStart.toISOString(),
      testEnd: testEnd.toISOString(),
      calibrationCandles: trainKlines.length,
      riskGateBlocks: foldRiskBlocks,
      signals: foldSignals,
    });
  }

  return {
    reportVersion: PORTFOLIO_REGIME_DIAGNOSTICS_VERSION,
    generatedAt: new Date().toISOString(),
    scope: {
      walkForwardRunId,
      asset: sourceRun.ativo,
      timeframe: sourceRun.timeframe,
      candlesTotal: sourceRun.candlesTotal,
      datasetHash: sourceRun.datasetHash,
    },
    diagnostics: {
      totalSignals,
      totalRiskGateBlocks: totalRiskBlocks,
      blockedSignalWinRatePct:
        totalRiskBlocks > 0
          ? (totalBlockedWins / totalRiskBlocks) * 100
          : null,
      blockedSignalLossRatePct:
        totalRiskBlocks > 0
          ? (totalBlockedLosses / totalRiskBlocks) * 100
          : null,
    },
    byTrend: serializeBuckets(byTrend),
    byVolatility: serializeBuckets(byVolatility),
    byMomentum: serializeBuckets(byMomentum),
    byCombinedRegime: serializeBuckets(byCombined),
    folds: foldDiagnostics,
    notes: [
      "This is a signal-level diagnostic, not an account-return metric.",
      "Each fold calibrates volatility thresholds only on its pre-test window.",
      "A blocked signal's outcome is measured using the same execution model as the walk-forward signal test.",
      "The diagnostic does not change any trading rule or optimize parameters.",
    ],
  };
}
