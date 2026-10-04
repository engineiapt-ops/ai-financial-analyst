import { strict as assert } from "node:assert";
import { MarketDataObservability } from "./observability.js";

const telemetry = new MarketDataObservability();
assert.equal(telemetry.snapshot().total, 0);

telemetry.record({
  provider: "saxo-sim",
  instrument: "FxSpot:21",
  timeframe: "1h",
  status: "success",
  latencyMs: 100,
  observedAt: "2026-10-04T12:00:00.000Z",
});

telemetry.record({
  provider: "ig-demo",
  instrument: "EURUSD",
  timeframe: "1h",
  status: "failure",
  latencyMs: 300,
  observedAt: "2026-10-04T12:01:00.000Z",
  errorCode: "AUTH_FAILED",
});

const snapshot = telemetry.snapshot();
assert.equal(snapshot.total, 2);
assert.equal(snapshot.successes, 1);
assert.equal(snapshot.failures, 1);
assert.equal(snapshot.averageLatencyMs, 200);
assert.equal(snapshot.lastObservation?.status, "failure");

console.log("market data observability tests passed");
