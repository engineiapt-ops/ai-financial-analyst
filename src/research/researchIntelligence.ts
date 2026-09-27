import { createHash } from "node:crypto";
import type { ResearchSnapshot } from "./snapshot.js";

export const RESEARCH_INTELLIGENCE_VERSION = "research-intelligence.v1";
export type ResearchIntelligenceState = "ready" | "degraded" | "blocked";

export interface ResearchIntelligenceOverview {
  version: typeof RESEARCH_INTELLIGENCE_VERSION;
  generatedAt: string;
  snapshot: {
    snapshotId: string;
    contentHash: string;
    schemaVersion: string;
    createdAt: string;
    signalId: number;
    decisionLogId: number;
    asset: string;
    timeframe: "1h" | "4h" | "1d";
    dataAsOf: string;
  };
  evidence: {
    totalCount: number;
    traceableCount: number;
    partialCount: number;
    invalidCount: number;
    pointInTimeValidCount: number;
    sourceCount: number;
    sourceNames: string[];
    sourceStatuses: ResearchSnapshot["research"]["sources"];
    items: Array<{
      evidenceId: string;
      source: string;
      title: string;
      publishedAt: string;
      url: string | null;
      stance: "positive" | "neutral" | "negative";
      sentimentScore: number;
      traceability: "complete" | "partial" | "invalid";
      pointInTimeValid: boolean;
    }>;
  };
  aggregate: {
    sentiment: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    sentimentAgreement: "positive" | "neutral" | "negative" | "mixed" | "no-evidence";
  };
  provenance: {
    chain: ["external-source", "evidence", "research-snapshot", "decision-log"];
    decisionLogLinked: boolean;
    signalLinked: boolean;
    timestampAligned: boolean;
    snapshotHashPresent: boolean;
  };
  quality: {
    state: ResearchIntelligenceState;
    flags: string[];
  };
  interpretation: {
    evidenceMeans: string;
    sentimentMeans: string;
    notCausalProof: true;
    notAnInvestmentVerdict: true;
  };
  notes: string[];
}

function makeEvidenceId(input: {
  source: string;
  title: string;
  publishedAt: string;
  url: string | null;
}): string {
  const canonical = [input.source, input.title, input.publishedAt, input.url]
    .map((value) => JSON.stringify(value))
    .join("|");

  return "re_" + createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 24);
}

export function buildResearchIntelligenceOverview(input: {
  snapshot: ResearchSnapshot;
  createdAt: Date;
  decisionLogId: number;
}): ResearchIntelligenceOverview {
  const dataAsOf = new Date(input.snapshot.analysis.dataAsOf);
  const researchAsOf = new Date(input.snapshot.research.asOf);

  if (Number.isNaN(dataAsOf.getTime()) || Number.isNaN(researchAsOf.getTime())) {
    throw new Error("Research snapshot requires valid timestamps");
  }

  const timestampAligned = dataAsOf.toISOString() === researchAsOf.toISOString();

  const items = input.snapshot.research.evidence.map((evidence) => {
    const publishedAt = new Date(evidence.publishedAt);
    const validTimestamp = !Number.isNaN(publishedAt.getTime());
    const pointInTimeValid =
      validTimestamp && publishedAt.getTime() <= researchAsOf.getTime();
    const complete =
      Boolean(evidence.source?.trim()) &&
      Boolean(evidence.title?.trim()) &&
      Boolean(evidence.url?.trim()) &&
      pointInTimeValid;
    const partial =
      Boolean(evidence.source?.trim()) &&
      Boolean(evidence.title?.trim()) &&
      validTimestamp;

    return {
      evidenceId: makeEvidenceId({
        source: evidence.source,
        title: evidence.title,
        publishedAt: evidence.publishedAt,
        url: evidence.url ?? null,
      }),
      source: evidence.source,
      title: evidence.title,
      publishedAt: evidence.publishedAt,
      url: evidence.url ?? null,
      stance: evidence.stance,
      sentimentScore: evidence.sentimentScore,
      traceability: complete ? "complete" : partial ? "partial" : "invalid",
      pointInTimeValid,
    };
  });

  const positiveCount = items.filter((item) => item.stance === "positive").length;
  const neutralCount = items.filter((item) => item.stance === "neutral").length;
  const negativeCount = items.filter((item) => item.stance === "negative").length;

  const sentimentAgreement =
    items.length === 0
      ? "no-evidence"
      : positiveCount > 0 && negativeCount > 0
        ? "mixed"
        : positiveCount > 0
          ? "positive"
          : negativeCount > 0
            ? "negative"
            : "neutral";

  const traceableCount = items.filter((item) => item.traceability === "complete").length;
  const partialCount = items.filter((item) => item.traceability === "partial").length;
  const invalidCount = items.filter((item) => item.traceability === "invalid").length;
  const pointInTimeValidCount = items.filter((item) => item.pointInTimeValid).length;
  const sourceNames = [...new Set(items.map((item) => item.source))].sort();

  const flags: string[] = [];
  if (items.length === 0) flags.push("no-evidence");
  if (partialCount > 0) flags.push("partial-traceability");
  if (invalidCount > 0) flags.push("invalid-evidence");
  if (!timestampAligned) flags.push("timestamp-misalignment");
  if (pointInTimeValidCount < items.length) flags.push("point-in-time-violation");
  if (input.decisionLogId <= 0) flags.push("missing-decision-log-link");
  if (!/^[0-9a-f]{64}$/.test(input.snapshot.contentHash)) flags.push("invalid-snapshot-hash");

  const state: ResearchIntelligenceState =
    flags.some((flag) =>
      ["invalid-evidence", "timestamp-misalignment", "point-in-time-violation", "invalid-snapshot-hash"].includes(flag),
    )
      ? "blocked"
      : flags.length > 0
        ? "degraded"
        : "ready";

  return {
    version: RESEARCH_INTELLIGENCE_VERSION,
    generatedAt: input.createdAt.toISOString(),
    snapshot: {
      snapshotId: input.snapshot.snapshotId,
      contentHash: input.snapshot.contentHash,
      schemaVersion: input.snapshot.schemaVersion,
      createdAt: input.createdAt.toISOString(),
      signalId: input.snapshot.analysis.signalId,
      decisionLogId: input.decisionLogId,
      asset: input.snapshot.analysis.ativo.toUpperCase(),
      timeframe: input.snapshot.analysis.timeframe,
      dataAsOf: dataAsOf.toISOString(),
    },
    evidence: {
      totalCount: items.length,
      traceableCount,
      partialCount,
      invalidCount,
      pointInTimeValidCount,
      sourceCount: sourceNames.length,
      sourceNames,
      sourceStatuses: input.snapshot.research.sources,
      items,
    },
    aggregate: {
      sentiment: input.snapshot.research.sentiment,
      positiveCount,
      neutralCount,
      negativeCount,
      sentimentAgreement,
    },
    provenance: {
      chain: ["external-source", "evidence", "research-snapshot", "decision-log"],
      decisionLogLinked: input.decisionLogId > 0,
      signalLinked: input.snapshot.analysis.signalId > 0,
      timestampAligned,
      snapshotHashPresent: /^[0-9a-f]{64}$/.test(input.snapshot.contentHash),
    },
    quality: {
      state,
      flags,
    },
    interpretation: {
      evidenceMeans: "Evidence is traceable external context attached to a point-in-time research snapshot.",
      sentimentMeans: "Aggregate sentiment is descriptive context, not causal attribution.",
      notCausalProof: true,
      notAnInvestmentVerdict: true,
    },
    notes: [
      "This contract is read-only research intelligence.",
      "Point-in-time validity requires publication time at or before the research cutoff.",
      "Source diversity is descriptive; it does not rank sources or select a strategy.",
    ],
  };
}
