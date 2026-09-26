import { z } from "zod";
import type { OnlineAnalysisPacket } from "../online/provenance.js";

export const AiNarrativeSchema = z.object({
  summary: z.string().min(1).max(4000),
  keyDrivers: z.array(z.string().min(1).max(1000)).max(8),
  riskFlags: z.array(z.string().min(1).max(1000)).max(8),
  watchItems: z.array(z.string().min(1).max(1000)).max(8),
  confidenceNote: z.string().min(1).max(1500),
});

export type AiNarrative = z.infer<typeof AiNarrativeSchema>;

export interface AiProviderResult {
  provider: string;
  model: string;
  generatedAt: string;
  inputPacketId: string;
  inputPacketHash: string;
  narrative: AiNarrative;
}

export interface AnalystAiProvider {
  readonly id: string;
  readonly model: string;
  analyze(packet: OnlineAnalysisPacket): Promise<AiProviderResult>;
}

export interface AiProviderDescriptor {
  id: string;
  model: string;
  configured: boolean;
  enabled: boolean;
}
