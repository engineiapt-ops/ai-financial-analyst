import { getResearchSnapshot } from "../db/repository.js";
import {
  buildResearchIntelligenceOverview,
  type ResearchIntelligenceOverview,
} from "./researchIntelligence.js";

export async function buildResearchIntelligenceForSnapshot(
  snapshotId: string,
  generatedAt = new Date(),
): Promise<ResearchIntelligenceOverview> {
  const stored = await getResearchSnapshot(snapshotId);
  if (!stored) {
    throw new Error("Research snapshot not found");
  }

  return buildResearchIntelligenceOverview({
    snapshot: stored.snapshot,
    createdAt: generatedAt,
    decisionLogId: stored.decisionLogId ?? 0,
  });
}
