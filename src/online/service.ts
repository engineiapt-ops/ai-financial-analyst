import { buildOnlineAnalysisPacket, type OnlineAnalysisPacket } from "./provenance.js";
import { analyzeMarket, type AnalyzeInput, type AnalyzeOutput } from "../api/analyze.js";
import { generateAnalystReport, type AnalystResearchResult } from "../research/report.js";
import { buildResearchSnapshot, type ResearchSnapshot } from "../research/snapshot.js";
import type { ResearchSnapshotRepository } from "../db/ports/researchSnapshotRepository.js";
import { saveResearchSnapshot } from "../db/repositories/researchSnapshotRepository.js";
import type { AiProviderResult, AiProviderDescriptor } from "../ai/provider.js";
import { getGeminiProvider } from "../ai/geminiProvider.js";

export interface OnlineAnalysisResult {
  analysis: AnalyzeOutput;
  research: AnalystResearchResult;
  snapshot: ResearchSnapshot;
  packet: OnlineAnalysisPacket;
  ai: AiProviderResult | null;
}

export type OnlineAiProvider = "none" | "gemini";

export interface OnlineAnalysisDependencies {
  analyzeMarket: typeof analyzeMarket;
  generateAnalystReport: typeof generateAnalystReport;
  buildResearchSnapshot: typeof buildResearchSnapshot;
  saveResearchSnapshot: ResearchSnapshotRepository["saveResearchSnapshot"];
  buildOnlineAnalysisPacket: typeof buildOnlineAnalysisPacket;
  getGeminiProvider: typeof getGeminiProvider;
}

const DEFAULT_DEPENDENCIES: OnlineAnalysisDependencies = {
  analyzeMarket,
  generateAnalystReport,
  buildResearchSnapshot,
  saveResearchSnapshot,
  buildOnlineAnalysisPacket,
  getGeminiProvider,
};

export function listAiProviders(): AiProviderDescriptor[] {
  const gemini = getGeminiProvider();
  return [
    {
      id: "none",
      model: "deterministic",
      configured: true,
      enabled: true,
    },
    {
      id: gemini.id,
      model: gemini.model,
      configured: gemini.configured,
      enabled: gemini.configured,
    },
  ];
}

export async function runOnlineAnalysis(
  input: AnalyzeInput,
  aiProvider: OnlineAiProvider = "none",
  dependencies: Partial<OnlineAnalysisDependencies> = {},
): Promise<OnlineAnalysisResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const analysis = await deps.analyzeMarket(input);
  const research = await deps.generateAnalystReport(analysis);
  const snapshot = deps.buildResearchSnapshot(analysis, research);
  const stored = await deps.saveResearchSnapshot({
    snapshot,
    decisionLogId: analysis.decisionLogId,
  });
  const packet = deps.buildOnlineAnalysisPacket(analysis, research, stored.snapshot);

  let ai: AiProviderResult | null = null;
  if (aiProvider === "gemini") {
    ai = await deps.getGeminiProvider().analyze(packet);
  }

  return {
    analysis,
    research,
    snapshot: stored.snapshot,
    packet,
    ai,
  };
}
