import { assertMarketDataConsistency, type MarketDataConsistency } from "./consistency.js";
import {
  createMarketDataProvenance,
  type MarketDataProvenance,
} from "./provenance.js";
import { MarketDataObservability } from "./observability.js";
import {
  MarketDataService,
  type MarketDataRequest,
  type MarketDataSnapshot,
} from "./service.js";

export interface MarketDataPipelineRequest extends MarketDataRequest {
  comparisonProviders?: readonly string[];
  maxRelativeDeviationBps?: number;
}

export interface MarketDataPipelineResult {
  primary: MarketDataSnapshot;
  provenance: MarketDataProvenance;
  consistency: MarketDataConsistency;
  comparisonSnapshots: readonly MarketDataSnapshot[];
}

export class MarketDataPipeline {
  constructor(
    private readonly service: MarketDataService,
    private readonly observability?: MarketDataObservability,
  ) {}

  async load(
    request: MarketDataPipelineRequest,
    checkedAt = new Date(),
  ): Promise<MarketDataPipelineResult> {
    const startedAt = Date.now();

    try {
      const primary = await this.service.getSnapshot(request, checkedAt);
      const comparisonSnapshots: MarketDataSnapshot[] = [];

      for (const provider of request.comparisonProviders ?? []) {
        const normalizedProvider = provider.trim();
        if (!normalizedProvider || normalizedProvider === primary.provider) continue;

        const comparisonRequest: MarketDataRequest = {
          provider: normalizedProvider,
          instrument: request.instrument,
          timeframe: request.timeframe,
          limit: request.limit,
          startTime: request.startTime,
          endTime: request.endTime,
        };

        comparisonSnapshots.push(
          await this.service.getSnapshot(comparisonRequest, checkedAt),
        );
      }

      const consistency = assertMarketDataConsistency(
        [
          { provider: primary.provider, candles: primary.candles },
          ...comparisonSnapshots.map((snapshot) => ({
            provider: snapshot.provider,
            candles: snapshot.candles,
          })),
        ],
        request.maxRelativeDeviationBps ?? 50,
      );

      const result = {
        primary,
        provenance: createMarketDataProvenance({
          metadata: primary.metadata,
          candles: primary.candles,
          quality: primary.quality,
        }),
        consistency,
        comparisonSnapshots,
      };

      this.observability?.record({
        provider: primary.provider,
        instrument: request.instrument,
        timeframe: request.timeframe,
        status: "success",
        latencyMs: Date.now() - startedAt,
        observedAt: checkedAt.toISOString(),
      });

      return result;
    } catch (error) {
      this.observability?.record({
        provider: request.provider,
        instrument: request.instrument,
        timeframe: request.timeframe,
        status: "failure",
        latencyMs: Date.now() - startedAt,
        observedAt: checkedAt.toISOString(),
        errorCode: error instanceof Error && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined,
      });
      throw error;
    }
  }
}
