export interface MarketDataObservation {
  provider: string;
  instrument: string;
  timeframe: string;
  status: "success" | "failure";
  latencyMs: number;
  observedAt: string;
  errorCode?: string;
}

export interface MarketDataObservabilitySnapshot {
  total: number;
  successes: number;
  failures: number;
  averageLatencyMs: number;
  lastObservation: MarketDataObservation | null;
}

export class MarketDataObservability {
  private observations: MarketDataObservation[] = [];

  record(observation: MarketDataObservation): void {
    if (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0) {
      throw new Error("Market data observation latency must be non-negative and finite");
    }
    this.observations.push({ ...observation });
  }

  snapshot(): MarketDataObservabilitySnapshot {
    const total = this.observations.length;
    const successes = this.observations.filter((item) => item.status === "success").length;
    const failures = total - successes;
    const averageLatencyMs =
      total === 0
        ? 0
        : this.observations.reduce((sum, item) => sum + item.latencyMs, 0) / total;

    return {
      total,
      successes,
      failures,
      averageLatencyMs,
      lastObservation: total ? { ...this.observations[total - 1] } : null,
    };
  }
}
