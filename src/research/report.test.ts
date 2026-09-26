import assert from "node:assert/strict";
import { buildTestAnalyzeOutput } from "./testFixtures.js";
import { buildDeterministicReport, collectResearchEvidence } from "./report.js";
import type { NewsSource } from "../features/sentimentPipeline.js";

const result = buildDeterministicReport(buildTestAnalyzeOutput(), 0, []);

assert.equal(result.recomendacao, "BUY");
assert.equal(result.fonteDecisao, "quantitativo");
assert.equal(result.riscos.length > 0, true);
assert.equal(typeof result.invalidacao, "string");
assert.ok(result.confianca >= 0 && result.confianca <= 1);

const healthy: NewsSource = {
  async fetchRecent() {
    return [
      {
        source: "mock-a",
        title: "Bitcoin rally after ETF inflow",
        publishedAt: new Date("2026-09-26T09:00:00Z"),
        url: "https://example.com/rally",
      },
      {
        source: "mock-b",
        title: "Bitcoin rally after ETF inflow",
        publishedAt: new Date("2026-09-26T08:59:00Z"),
      },
      {
        source: "mock-a",
        title: "Bitcoin faces bearish outlook",
        publishedAt: new Date("2026-09-26T08:00:00Z"),
      },
      {
        source: "mock-a",
        title: "Bitcoin news after the cutoff",
        publishedAt: new Date("2026-09-26T12:00:00Z"),
      },
    ];
  },
};

const failing: NewsSource = {
  async fetchRecent() {
    throw new Error("provider offline");
  },
};

const research = await collectResearchEvidence(
  "BTCUSDT",
  new Date("2026-09-26T10:00:00Z"),
  [healthy, failing],
);

assert.equal(research.evidence.length, 2);
assert.equal(research.evidence[0]?.source, "mock-a");
assert.equal(research.evidence[0]?.stance, "positive");
assert.equal(research.evidence[0]?.url, "https://example.com/rally");
assert.equal(research.evidence[1]?.stance, "negative");
assert.equal(research.sources.length, 2);
assert.equal(research.sources[0]?.status, "ok");
assert.equal(research.sources[0]?.headlines, 4);
assert.equal(research.sources[1]?.status, "error");
assert.equal(research.sentiment, 0);

console.log("research report tests passed");
