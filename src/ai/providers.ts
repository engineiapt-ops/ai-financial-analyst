import { getGeminiProvider } from "./geminiProvider.js";
import type { AiProviderDescriptor } from "./provider.js";

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
