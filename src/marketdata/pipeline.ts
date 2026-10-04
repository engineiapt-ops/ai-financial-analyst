import { assertMarketDataConsistency, type MarketDataConsistency } from "./consistency.js";
import {
  createMarketDataProvenance,
  type MarketDataProvenance,
} from "./provenance.js";
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
  constructor(private readonly service: MarketDataService) {}

  async load(
    request: MarketDataPipelineRequest,
    checkedAt = new Date(),
  ): Promise<MarketDataPipelineResult> {
    const primary = await this.service.getSnapshot(request, checkedAt);
    const comparisonSnapshots: MarketDataSnapshot[] = [];

    for (const provider of request.comparisonProviders ?? []) {
      const normalizedProvider = provider.trim();
      if (!normalizedProvider || normalizedProvider === primary.provider) continue;

      comparisonSnapshots.push(
        await this.service.getSnapshot(
          { ...request, provider: normalizedProvider, comparisonProviders: undefined },
          checkedAt,
        ),
      );
    }

    const consistency = assertMarketDataConsistency(
      [
        {
          provider: primary.provider,
          candles: primary.candles,
        },
        ...comparisonSnapshots.map((snapshot) => ({
          provider: snapshot.provider,
          candles: snapshot.candles,
        })),
      ],
      request.maxRelativeDeviationBps ?? 50,
    );

    return {
      primary,
      provenance: createMarketDataProvenance({
        metadata: primary.metadata,
        candles: primary.candles,
        quality: primary.quality,
      }),
      consistency,
      comparisonSnapshots,
    };
  }
}
