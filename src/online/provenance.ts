import { createHash } from "node:crypto";
import type { AnalyzeOutput } from "../api/analyze.js";
import type { AnalystResearchResult } from "../research/report.js";
import type { ResearchSnapshot } from "../research/snapshot.js";

export const ONLINE_ANALYSIS_PACKET_VERSION = "online-analysis.v1";

export interface OnlineAnalysisPacket {
  packetVersion: typeof ONLINE_ANALYSIS_PACKET_VERSION;
  packetId: string;
  createdAt: string;
  analysis: AnalyzeOutput;
  research: AnalystResearchResult;
  snapshot: {
    snapshotId: string;
    contentHash: string;
    schemaVersion: ResearchSnapshot["schemaVersion"];
  };
  provenance: {
    signalId: number;
    decisionLogId: number;
    dataAsOf: string;
    marketDataQuality: AnalyzeOutput["marketDataQuality"];
    decisionSource: AnalyzeOutput["decision"]["origem"];
    deterministicRecommendation: AnalyzeOutput["decision"]["recomendacao"];
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function buildOnlineAnalysisPacket(
  analysis: AnalyzeOutput,
  research: AnalystResearchResult,
  snapshot: ResearchSnapshot,
): OnlineAnalysisPacket {
  const dataAsOf = new Date(analysis.market.dataAsOf);
  const snapshotAsOf = new Date(snapshot.analysis.dataAsOf);

  if (Number.isNaN(dataAsOf.getTime()) || dataAsOf.toISOString() !== snapshotAsOf.toISOString()) {
    throw new Error("Online analysis packet requires aligned analysis and snapshot timestamps");
  }

  if (research.asOf !== dataAsOf.toISOString()) {
    throw new Error("Online analysis packet requires research.asOf to match analysis.dataAsOf");
  }

  if (snapshot.analysis.decisionLogId !== analysis.decisionLogId) {
    throw new Error("Online analysis packet requires the same decisionLogId across artifacts");
  }

  const base = {
    packetVersion: ONLINE_ANALYSIS_PACKET_VERSION as typeof ONLINE_ANALYSIS_PACKET_VERSION,
    analysis,
    research,
    snapshot: {
      snapshotId: snapshot.snapshotId,
      contentHash: snapshot.contentHash,
      schemaVersion: snapshot.schemaVersion,
    },
    provenance: {
      signalId: analysis.signalId,
      decisionLogId: analysis.decisionLogId,
      dataAsOf: dataAsOf.toISOString(),
      marketDataQuality: analysis.marketDataQuality,
      decisionSource: analysis.decision.origem,
      deterministicRecommendation: analysis.decision.recomendacao,
    },
  };

  const packetHash = hash(base);
  return {
    ...base,
    packetId: `oa_${packetHash.slice(0, 24)}`,
    createdAt: new Date().toISOString(),
  };
}

export function computeOnlineAnalysisPacketHash(packet: OnlineAnalysisPacket): string {
  return hash({
    packetVersion: packet.packetVersion,
    analysis: packet.analysis,
    research: packet.research,
    snapshot: packet.snapshot,
    provenance: packet.provenance,
  });
}
