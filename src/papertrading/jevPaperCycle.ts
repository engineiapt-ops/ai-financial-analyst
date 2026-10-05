import { createDefaultMarketDataService } from "../marketdata/defaultService.js";
import { filterKlinesByAsOf } from "../marketdata/pointInTime.js";
import {
  findDecisionLogByAsOf,
  type DecisionLogRecord,
} from "../db/repository.js";
import { analyzeMarket, type AnalyzeOutput } from "../api/analyze.js";
import type { Kline, Timeframe } from "../types.js";

export const JEVAUTOPAPER_TIMEFRAMES: readonly Timeframe[] = ["1h", "4h", "1d"];

export interface JevPaperCycleOptions {
  ativo?: string;
  timeframes?: readonly Timeframe[];
  valorInvestimento?: number;
  news?: boolean;
}

export interface JevPaperCycleResult {
  asset: string;
  generatedAt: string;
  analyzed: number;
  skippedExisting: number;
  notReady: number;
  failed: number;
  results: Array<{
    timeframe: Timeframe;
    status: "analyzed" | "skipped_existing" | "not_ready" | "failed";
    dataAsOf?: string;
    decisionLogId?: number;
    recommendation?: AnalyzeOutput["decision"]["recomendacao"];
    probability?: number;
    confidence?: number;
    error?: string;
  }>;
}

export interface JevPaperCycleDependencies {
  now: () => Date;
  fetchCandles: (ativo: string, timeframe: Timeframe, limit: number) => Promise<Kline[]>;
  findExisting: (
    ativo: string,
    timeframe: Timeframe,
    dataAsOf: Date,
  ) => Promise<DecisionLogRecord | null>;
  analyze: (input: {
    ativo: string;
    timeframe: Timeframe;
    valorInvestimento: number;
    engine: "jev";
    news: boolean;
  }) => Promise<AnalyzeOutput>;
}

const defaultMarketDataService = createDefaultMarketDataService();

const defaultDependencies: JevPaperCycleDependencies = {
  now: () => new Date(),
  fetchCandles: async (ativo, timeframe, limit) =>
    (await defaultMarketDataService.getSnapshot({
      provider: "binance",
      instrument: ativo,
      timeframe,
      limit,
      endTime: Date.now(),
    }, new Date())).candles,
  findExisting: findDecisionLogByAsOf,
  analyze: analyzeMarket,
};

function normalizeAsset(value: string): string {
  const asset = value.trim().toUpperCase();
  if (!asset) throw new Error("ativo is required");
  return asset;
}

function validateOptions(options: JevPaperCycleOptions): void {
  const value = options.valorInvestimento ?? 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("valorInvestimento must be greater than zero");
  }

  const timeframes = options.timeframes ?? JEVAUTOPAPER_TIMEFRAMES;
  if (!timeframes.length) throw new Error("at least one timeframe is required");
  for (const timeframe of timeframes) {
    if (!JEVAUTOPAPER_TIMEFRAMES.includes(timeframe)) {
      throw new Error("unsupported timeframe");
    }
  }
}

export async function runJevPaperCycle(
  options: JevPaperCycleOptions = {},
  dependencies: JevPaperCycleDependencies = defaultDependencies,
): Promise<JevPaperCycleResult> {
  validateOptions(options);

  const asset = normalizeAsset(options.ativo ?? "BTCUSDT");
  const timeframes = options.timeframes ?? JEVAUTOPAPER_TIMEFRAMES;
  const valorInvestimento = options.valorInvestimento ?? 100;
  const news = options.news ?? true;
  const generatedAt = dependencies.now();

  console.log(JSON.stringify({
    event: "paper_jev_cron_timeframe_schedule",
    schedule: "hourly",
    timeframes,
    limitation: "hourly paper cycle via GitHub/external scheduler; Vercel Hobby cron remains daily fallback",
  }));

  let analyzed = 0;
  let skippedExisting = 0;
  let notReady = 0;
  let failed = 0;
  const results: JevPaperCycleResult["results"] = [];

  for (const timeframe of timeframes) {
    try {
      const candles = filterKlinesByAsOf(
        await dependencies.fetchCandles(asset, timeframe, 100),
        generatedAt,
      );

      if (candles.length < 21) {
        notReady += 1;
        results.push({
          timeframe,
          status: "not_ready",
          error: "Insufficient closed market candles for EMA21",
        });
        continue;
      }

      const last = candles[candles.length - 1];
      const dataAsOf = last.closeTime ?? last.openTime;
      const existing = await dependencies.findExisting(asset, timeframe, dataAsOf);

      if (existing) {
        skippedExisting += 1;
        results.push({
          timeframe,
          status: "skipped_existing",
          dataAsOf: dataAsOf.toISOString(),
          decisionLogId: existing.id,
          recommendation: existing.recomendacao,
          probability: existing.jevProbs?.[existing.jevChoice ?? ""] ?? undefined,
          confidence: existing.confidence ?? undefined,
        });
        continue;
      }

      const output = await dependencies.analyze({
        ativo: asset,
        timeframe,
        valorInvestimento,
        engine: "jev",
        news,
      });

      analyzed += 1;
      results.push({
        timeframe,
        status: "analyzed",
        dataAsOf: dataAsOf.toISOString(),
        decisionLogId: output.decisionLogId,
        recommendation: output.decision.recomendacao,
        probability: output.decision.probabilidadeDirecional,
        confidence: output.decision.confidence,
      });
    } catch (error) {
      failed += 1;
      results.push({
        timeframe,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    asset,
    generatedAt: generatedAt.toISOString(),
    analyzed,
    skippedExisting,
    notReady,
    failed,
    results,
  };
}
