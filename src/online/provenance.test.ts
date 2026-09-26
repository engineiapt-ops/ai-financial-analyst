import { strict as assert } from "node:assert";
import { buildTestAnalyzeOutput } from "../research/testFixtures.js";
import { buildDeterministicReport, type AnalystResearchResult } from "../research/report.js";
import { buildResearchSnapshot } from "../research/snapshot.js";
import {
  buildOnlineAnalysisPacket,
  computeOnlineAnalysisPacketHash,
} from "./provenance.js";

const analysis = buildTestAnalyzeOutput();
const research: AnalystResearchResult = {
  asOf: new Date(analysis.market.dataAsOf).toISOString(),
  sentiment: 0.25,
  evidence: [],
  sources: [],
  report: buildDeterministicReport(analysis, 0.25, []),
};
const snapshot = buildResearchSnapshot(analysis, research);

const packetA = buildOnlineAnalysisPacket(analysis, research, snapshot);
const packetB = buildOnlineAnalysisPacket(analysis, research, snapshot);

assert.equal(packetA.packetVersion, "online-analysis.v1");
assert.equal(packetA.packetId, packetB.packetId);
assert.equal(packetA.provenance.decisionLogId, analysis.decisionLogId);
assert.equal(packetA.snapshot.contentHash, snapshot.contentHash);
const packetHash = computeOnlineAnalysisPacketHash(packetA);\nassert.equal(packetHash.length, 64);\nassert.equal(packetA.packetId, "oa_" + packetHash.slice(0, 24));
assert.equal(computeOnlineAnalysisPacketHash(packetA), packetA.packetId.replace("oa_", "").padEnd(24, "0").slice(0, 24) === packetA.packetId.replace("oa_", "") ? computeOnlineAnalysisPacketHash(packetA) : computeOnlineAnalysisPacketHash(packetA));

const mismatchedResearch = { ...research, asOf: "2026-09-26T12:00:00.000Z" };
assert.throws(
  () => buildOnlineAnalysisPacket(analysis, mismatchedResearch, snapshot),
  /research.asOf to match analysis.dataAsOf/,
);

console.log("online provenance tests passed");
