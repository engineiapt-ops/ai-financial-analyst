import {
  getBacktestRun,
  getMarketDataRange,
  getPortfolioPositions,
  type PortfolioPositionRow,
} from "../db/repository.js";
import { assertDatasetMatchesMetadata } from "../marketdata/dataset.js";
import {
  buildRegimeSeries,
  calibrateRegimeThresholds,
  findRegimeAtOrBefore,
  type RegimeSnapshot,
} from "./regime.js";
import { evaluateRisk } from "./riskEngine.js";

interface RegimeMetrics {
  regime: string;
  trend: RegimeSnapshot["trend"];
  volatility: RegimeSnapshot["volatility"];
  momentum: RegimeSnapshot["momentum"];
  candles: number;
  portfolioEntries: number;
  executedPositions: number;
  rejectedPositions: number;
  winningPositions: number;
  losingPositions: number;
  allocatedNotional: number;
  netPnl: number;
  returnOnAllocatedPct: number | null;
  highVolatilityBlocksWouldOccur: number;
}

function emptyMetric(regime: RegimeSnapshot): RegimeMetrics {
  return {
    regime: regime.key,
    trend: regime.trend,
    volatility: regime.volatility,
    momentum: regime.momentum,
    candles: 0,
    portfolioEntries: 0,
    executedPositions: 0,
    rejectedPositions: 0,
    winningPositions: 0,
    losingPositions: 0,
    allocatedNotional: 0,
    netPnl: 0,
    returnOnAllocatedPct: null,
    highVolatilityBlocksWouldOccur: 0,
  };
}

function upsertMetric(map: Map<string, RegimeMetrics>, regime: RegimeSnapshot): RegimeMetrics {
  const current = map.get(regime.key);
  if (current) return current;
  const created = emptyMetric(regime);
  map.set(regime.key, created);
  return created;
}

export async function runRiskRegimeAnalysis(
  sourceRunId: number,
  portfolioRunId?: number,
) {
  const sourceRun = await getBacktestRun(sourceRunId);
  if (!sourceRun) throw new Error(`Run ${sourceRunId} not found`);

  const klines = await getMarketDataRange(
    sourceRun.ativo,
    sourceRun.timeframe,
    sourceRun.periodoInicio,
    sourceRun.periodoFim,
  );
  assertDatasetMatchesMetadata(klines, sourceRun.candlesTotal, sourceRun.datasetHash);

  const calibrationCandles = Math.floor(
    klines.length * (sourceRun.oosStartRatio ?? 0.7),
  );
  if (calibrationCandles < 30 || calibrationCandles >= klines.length) {
    throw new Error("Invalid calibration window for regime analysis");
  }

  const calibrationEnd = klines[calibrationCandles - 1].closeTime
    ?? klines[calibrationCandles - 1].openTime;
  const thresholds = calibrateRegimeThresholds(
    klines,
    calibrationCandles,
    calibrationEnd,
  );
  const allRegimes = buildRegimeSeries(klines, thresholds);
  const evaluationRegimes = allRegimes.slice(calibrationCandles);

  const metrics = new Map<string, RegimeMetrics>();
  for (const regime of evaluationRegimes) {
    upsertMetric(metrics, regime).candles += 1;
  }

  const portfolioPositions: PortfolioPositionRow[] = portfolioRunId
    ? await getPortfolioPositions(portfolioRunId)
    : [];

  for (const position of portfolioPositions) {
    if (!position.openedAt) continue;
    const regime = findRegimeAtOrBefore(evaluationRegimes, position.openedAt);
    if (!regime) continue;

    const metric = upsertMetric(metrics, regime);
    metric.portfolioEntries += 1;

    const syntheticDecision = {
      origem: "baseline" as const,
      recomendacao: position.side,
      tamanhoPosicaoPct: 2,
    };
    const wouldRiskBlock =
      evaluateRisk(syntheticDecision, regime).reason === "high_volatility";
    if (wouldRiskBlock) metric.highVolatilityBlocksWouldOccur += 1;

    if (position.status === "rejected") {
      metric.rejectedPositions += 1;
      continue;
    }

    metric.executedPositions += 1;
    metric.allocatedNotional += Number(position.allocatedNotional ?? 0);
    const pnl = Number(position.netPnl ?? 0);
    metric.netPnl += pnl;
    if (pnl > 0) metric.winningPositions += 1;
    if (pnl < 0) metric.losingPositions += 1;

    const syntheticDecision = {
      origem: "baseline",
      recomendacao: position.side,
      tamanhoPosicaoPct: 2,
    } as const;
    const wouldRiskBlock = evaluateRisk(syntheticDecision, regime).reason === "high_volatility";
    if (wouldRiskBlock) metric.highVolatilityBlocksWouldOccur += 1;
  }

  for (const metric of metrics.values()) {
    metric.returnOnAllocatedPct = metric.allocatedNotional > 0
      ? (metric.netPnl / metric.allocatedNotional) * 100
      : null;
  }

  const totalCandles = evaluationRegimes.length;
  const highVolatilityCandles = evaluationRegimes.filter((item) => item.volatility === "HIGH").length;

  return {
    sourceRunId,
    portfolioRunId: portfolioRunId ?? null,
    asset: sourceRun.ativo,
    timeframe: sourceRun.timeframe,
    datasetHash: sourceRun.datasetHash,
    modelVersion: thresholds.version,
    calibration: {
      candles: calibrationCandles,
      frozenAt: thresholds.frozenAt,
      lowVolAtrRelative: thresholds.lowVolAtrRelative,
      highVolAtrRelative: thresholds.highVolAtrRelative,
    },
    evaluation: {
      candles: totalCandles,
      highVolatilityCandles,
      highVolatilityPct: totalCandles ? (highVolatilityCandles / totalCandles) * 100 : 0,
    },
    regimes: [...metrics.values()].sort((a, b) => a.regime.localeCompare(b.regime)),
    notes: [
      "Regime thresholds are calibrated only on the pre-OOS window and then frozen.",
      "P&L by regime is diagnostic; it is not an account-level return metric.",
      "High-volatility blocks are hypothetical for the existing portfolio run because the risk gate was not present in that historical execution.",
    ],
  };
}
