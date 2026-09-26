import assert from "node:assert/strict";
import { buildTestAnalyzeOutput } from "./testFixtures.js";
import { buildDeterministicReport, type AnalystResearchResult } from "./report.js";
import { buildResearchSnapshot } from "./snapshot.js";

const analysis = buildTestAnalyzeOutput();
const research: AnalystResearchResult = {
  asOf: new Date(analysis.market.dataAsOf).toISOString(),
  sentiment: 0.25,
  evidence: [
    {
      source: "mock",
      title: "Bitcoin rally",
      publishedAt: "2026-09-26T10:00:00.000Z",
      url: "https://example.com/btc",
      sentimentScore: 1,
      stance: "positive",
    },
  ],
  sources: [{ source: "mock", status: "ok", headlines: 1 }],
  report: buildDeterministicReport(analysis, 0.25, [
    {
      source: "mock",
      title: "Bitcoin rally",
      publishedAt: "2026-09-26T10:00:00.000Z",
      url: "https://example.com/btc",
      sentimentScore: 1,
      stance: "positive",
    },
  ]),
};

const first = buildResearchSnapshot(analysis, research);
const second = buildResearchSnapshot(analysis, research);

assert.equal(first.schemaVersion, "research-snapshot.v1");
assert.equal(first.snapshotId, second.snapshotId);
assert.equal(first.contentHash, second.contentHash);
assert.match(first.snapshotId, /^rs_[a-f0-9]{24}$/);
assert.equal(first.analysis.signalId, 1);
assert.equal(first.decision.recomendacao, "BUY");
assert.equal(first.research.evidence[0]?.source, "mock");
assert.equal(first.risk.regime.key, "normal");

assert.throws(
  () =>
    buildResearchSnapshot(analysis, {
      ...research,
      asOf: "2026-09-26T12:00:00.000Z",
    }),
  /research.asOf must match analysis.market.dataAsOf/,
);

console.log("research snapshot tests passed");
