import {
  AiNarrativeSchema,
  type AiProviderResult,
  type AnalystAiProvider,
  type AiNarrative,
} from "./provider.js";
import type { OnlineAnalysisPacket } from "../online/provenance.js";
import { computeOnlineAnalysisPacketHash } from "../online/provenance.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.8-flash-lite-tts";

export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL;
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 30_000;

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export class GeminiProviderError extends Error {
  readonly code = "GEMINI_PROVIDER_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

function extractText(payload: GeminiGenerateResponse): string {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) throw new GeminiProviderError("Gemini returned no text content");
  return text;
}

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    keyDrivers: { type: "array", items: { type: "string" } },
    riskFlags: { type: "array", items: { type: "string" } },
    watchItems: { type: "array", items: { type: "string" } },
    confidenceNote: { type: "string" },
  },
  required: ["summary", "keyDrivers", "riskFlags", "watchItems", "confidenceNote"],
};

function buildPrompt(packet: OnlineAnalysisPacket): string {
  const instructions = [
    "Você é a camada de análise contextual de um sistema financeiro.",
    "A decisão quantitativa determinística já foi calculada e é a fonte de verdade.",
    "NÃO altere, substitua ou recomende outra ação além da recomendação determinística.",
    "Produza somente contexto: resumo, principais drivers, riscos, pontos para observar e uma nota sobre a confiança.",
    "Não invente dados. Baseie-se exclusivamente no pacote fornecido.",
    "Diferencie fatos do pacote de interpretação. Não trate manchetes como causalidade.",
    "Retorne apenas JSON compatível com o schema solicitado.",
    "",
    "Pacote:",
  ];
  return instructions.join("\n") + "\n" + JSON.stringify(packet);
}

export class GeminiProvider implements AnalystAiProvider {
  readonly id = "gemini";
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey.trim() : process.env.GEMINI_API_KEY?.trim();
    this.model = options.model?.trim() || GEMINI_MODEL;
    this.baseUrl = (options.baseUrl?.trim() || process.env.GEMINI_API_BASE?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? Number(process.env.GEMINI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async analyze(packet: OnlineAnalysisPacket): Promise<AiProviderResult> {
    if (!this.apiKey) throw new GeminiProviderError("GEMINI_API_KEY is not configured");

    const packetHash = computeOnlineAnalysisPacketHash(packet);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        this.baseUrl + "/models/" + encodeURIComponent(this.model) + ":generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(packet) }] }],
            generationConfig: {
              responseFormat: {
                text: {
                  mimeType: "application/json",
                  schema: responseSchema,
                },
              },
            },
          }),
          signal: controller.signal,
        },
      );

      const bodyText = await response.text();
      if (!response.ok) {
        throw new GeminiProviderError("Gemini HTTP " + response.status + ": " + bodyText.slice(0, 1000));
      }

      let payload: GeminiGenerateResponse;
      try {
        payload = JSON.parse(bodyText) as GeminiGenerateResponse;
      } catch {
        throw new GeminiProviderError("Gemini returned invalid JSON envelope");
      }

      const modelText = extractText(payload);
      let rawNarrative: unknown;
      try {
        rawNarrative = JSON.parse(modelText);
      } catch {
        throw new GeminiProviderError("Gemini returned non-JSON narrative content");
      }

      const narrative: AiNarrative = AiNarrativeSchema.parse(rawNarrative);
      return {
        provider: this.id,
        model: this.model,
        generatedAt: new Date().toISOString(),
        inputPacketId: packet.packetId,
        inputPacketHash: packetHash,
        narrative,
      };
    } catch (error) {
      if (error instanceof GeminiProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GeminiProviderError("Gemini request timed out after " + this.timeoutMs + "ms");
      }
      throw new GeminiProviderError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getGeminiProvider(): GeminiProvider {
  return new GeminiProvider();
}
