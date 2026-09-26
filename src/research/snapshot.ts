import { createHash } from "node:crypto";
import type { AnalyzeOutput } from "../api/analyze.js";
import type { AnalystReport, AnalystResearchResult } from "./report.js";

export const RESEARCH_SNAPSHOT_VERSION = "research-snapshot.v1";

export interface ResearchSnapshot {
  schemaVersion: typeof RESEARCH_SNAPSHOT_VERSION;
  snapshotId: string;
  contentHash: string;
  createdAt: string;
  analysis: {
    signalId: number;
    decisionLogId: number;
    ativo: string;
    timeframe: AnalyzeOutput["market"]["timeframe"];
    dataAsOf: string;
    referencePrice: number;
    indicators: AnalyzeOutput["market"]["indicators"];
  };
  decision: {
    origem: AnalyzeOutput["decision"]["origem"];
    recomendacao: AnalyzeOutput["decision"]["recomendacao"];
    tamanhoPosicaoPct: number;
    confidence: number | null;
    qualityScore: number | null;
    riscoElevado: boolean;
    jevChoice: AnalyzeOutput["decision"]["jevChoice"] | null;
    jevProbs: Record<string, number> | null;
    jevModelVersion: string | null;
    observacao: string | null;
  };
  risk: {
    version: string;
    allowed: boolean;
    positionSizePct: number;
    maxGrossExposurePct: number;
    reason: string;
    regime: AnalyzeOutput["risk"]["regime"];
  };
  research: {
    asOf: string;
    sentiment: number;
    evidence: AnalystResearchResult["evidence"];
    sources: AnalystResearchResult["sources"];
  };
  report: AnalystReport;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function hashContent(value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildResearchSnapshot(
  analysis: AnalyzeOutput,
  research: AnalystResearchResult,
): ResearchSnapshot {
  const dataAsOf = new Date(analysis.market.dataAsOf);
  if (Number.isNaN(dataAsOf.getTime())) {
    throw new Error("analysis.market.dataAsOf must be a valid date");
  }

  if (research.asOf !== dataAsOf.toISOString()) {
    throw new Error("research.asOf must match analysis.market.dataAsOf");
  }

  const content = {
    schemaVersion: RESEARCH_SNAPSHOT_VERSION,
    analysis: {
      signalId: analysis.signalId,
      decisionLogId: analysis.decisionLogId,
      ativo: analysis.market.ativo,
      timeframe: analysis.market.timeframe,
      dataAsOf: dataAsOf.toISOString(),
      referencePrice: analysis.market.precoAtual,
      indicators: analysis.market.indicators,
    },
    decision: {
      origem: analysis.decision.origem,
      recomendacao: analysis.decision.recomendacao,
      tamanhoPosicaoPct: analysis.decision.tamanhoPosicaoPct,
      confidence: analysis.decision.confidence ?? null,
      qualityScore: analysis.decision.qualityScore ?? null,
      riscoElevado: Boolean(analysis.decision.riscoElevado),
      jevChoice: analysis.decision.jevChoice ?? null,
      jevProbs: analysis.decision.jevProbs ?? null,
      jevModelVersion: analysis.decision.jevModelVersion ?? null,
      observacao: analysis.decision.observacao ?? null,
    },
    risk: {
      version: analysis.risk.version,
      allowed: analysis.risk.allowed,
      positionSizePct: analysis.risk.positionSizePct,
      maxGrossExposurePct: analysis.risk.maxGrossExposurePct,
      reason: analysis.risk.reason,
      regime: analysis.risk.regime,
    },
    research: {
      asOf: research.asOf,
      sentiment: research.sentiment,
      evidence: research.evidence,
      sources: research.sources,
    },
    report: research.report,
  };

  const contentHash = hashContent(content);

  return {
    ...content,
    snapshotId: `rs_${contentHash.slice(0, 24)}`,
    contentHash,
    createdAt: new Date().toISOString(),
  };
}
