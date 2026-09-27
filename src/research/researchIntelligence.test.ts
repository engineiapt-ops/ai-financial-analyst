import { strict as assert } from "node:assert";
import { buildTestAnalyzeOutput } from "./testFixtures.js";
import { buildDeterministicReport, type AnalystResearchResult } from "./report.js";
import { buildResearchSnapshot } from "./snapshot.js";
import {
  buildResearchIntelligenceOverview,
  RESEARCH_INTELLIGENCE_VERSION,
} from "./researchIntelligence.js";

const analysis = buildTestAnalyzeOutput();
const asOf = new Date(analysis.market.dataAsOf);
const research: AnalystResearchResult = {
  asOf: asOf.toISOString(),
  sentiment: 0.25,
  evidence: [
    {
      source: "gdelt",
      title: "Bitcoin adoption expands",
      publishedAt: new Date(asOf.getTime() - 60_000).toISOString(),
      url: "https://example.com/a",
      sentimentScore: 1,
      stance: "positive",
    },
    {
      source: "cryptopanic",
      title: "Bitcoin market mixed",
      publishedAt: new Date(asOf.getTime() - 30_000).toISOString(),
      url: "https://example.com/b",
      sentimentScore: 0,
      stance: "neutral",
    },
  ],
  sources: [
    { source: "GdeltSource", status: "ok", headlines: 1 },
    { source: "CryptoPanicSource", status: "ok", headlines: 1 },
  ],
  report: buildDeterministicReport(analysis, 0.25, []),
};

const snapshot = buildResearchSnapshot(analysis, research);
const overview = buildResearchIntelligenceOverview({
  snapshot,
  createdAt: new Date("2026-09-27T10:01:00.000Z"),
  decisionLogId: analysis.decisionLogId,
});

assert.equal(overview.version, RESEARCH_INTELLIGENCE_VERSION);
assert.equal(overview.quality.state, "ready");
assert.equal(overview.evidence.totalCount, 2);
assert.equal(overview.evidence.traceableCount, 2);
assert.equal(overview.evidence.sourceCount, 2);
assert.equal(overview.evidence.pointInTimeValidCount, 2);
assert.equal(overview.provenance.decisionLogLinked, true);
assert.equal(overview.provenance.timestampAligned, true);
assert.equal(overview.aggregate.sentimentAgreement, "positive");
assert.equal(overview.evidence.items[0].evidenceId.length, 27);

const invalid = buildResearchIntelligenceOverview({
  snapshot: {
    ...snapshot,
    research: {
      ...snapshot.research,
      evidence: [
        {
          ...snapshot.research.evidence[0],
          publishedAt: new Date(asOf.getTime() + 60_000).toISOString(),
          url: undefined,
        },
      ],
    },
  },
  createdAt: new Date("2026-09-27T10:02:00.000Z"),
  decisionLogId: analysis.decisionLogId,
});

assert.equal(invalid.quality.state, "blocked");
assert.ok(invalid.quality.flags.includes("point-in-time-violation"));

console.log("research intelligence tests passed");
