import { buildOnlineAnalysisPacket, type OnlineAnalysisPacket } from "./provenance.js";
import { analyzeMarket, type AnalyzeInput, type AnalyzeOutput } from "../api/analyze.js";
import { generateAnalystReport, type AnalystResearchResult } from "../research/report.js";
import { buildResearchSnapshot, type ResearchSnapshot } from "../research/snapshot.js";
import { saveResearchSnapshot } from "../db/repository.js";
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
): Promise<OnlineAnalysisResult> {
  const analysis = await analyzeMarket(input);
  const research = await generateAnalystReport(analysis);
  const snapshot = buildResearchSnapshot(analysis, research);
  const stored = await saveResearchSnapshot({
    snapshot,
    decisionLogId: analysis.decisionLogId,
  });
  const packet = buildOnlineAnalysisPacket(analysis, research, stored.snapshot);

  let ai: AiProviderResult | null = null;
  if (aiProvider === "gemini") {
    ai = await getGeminiProvider().analyze(packet);
  }

  return {
    analysis,
    research,
    snapshot: stored.snapshot,
    packet,
    ai,
  };
}
