import { GoogleGenAI } from "@google/genai";

export type GeminiGenerateContentRequest =
  Parameters<GoogleGenAI["models"]["generateContent"]>[0];

export type GeminiGenerateContentResponse =
  Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

export interface GeminiSdkClient {
  models: {
    generateContent(
      request: GeminiGenerateContentRequest,
    ): Promise<GeminiGenerateContentResponse>;
  };
}

export interface GeminiClientOptions {
  apiKey?: string;
  sdkClient?: GeminiSdkClient;
}

export class GeminiClientError extends Error {
  readonly code = "GEMINI_CLIENT_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "GeminiClientError";
  }
}

/**
 * Provider adapter for the Google Gemini SDK.
 *
 * The rest of the application depends only on this narrow interface, keeping
 * the vendor SDK confined to the AI infrastructure layer.
 */
export class GeminiClient {
  private readonly client: GeminiSdkClient;

  constructor(client: GeminiSdkClient) {
    this.client = client;
  }

  generateContent(
    request: GeminiGenerateContentRequest,
  ): Promise<GeminiGenerateContentResponse> {
    return this.client.models.generateContent(request);
  }
}

function normalizeApiKey(apiKey: string | undefined): string | undefined {
  const value = apiKey?.trim();
  return value ? value : undefined;
}

export function createGeminiClient(
  options: GeminiClientOptions = {},
): GeminiClient | null {
  const apiKey = normalizeApiKey(
    options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  );
  if (!apiKey && !options.sdkClient) return null;

  try {
    const sdkClient =
      options.sdkClient ??
      new GoogleGenAI({
        apiKey: apiKey!,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

    return new GeminiClient(sdkClient);
  } catch (error) {
    throw new GeminiClientError(
      error instanceof Error
        ? `Failed to initialize Gemini client: ${error.message}`
        : "Failed to initialize Gemini client",
    );
  }
}
