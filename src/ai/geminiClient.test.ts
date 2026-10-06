import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  GeminiClient,
  createGeminiClient,
  type GeminiGenerateContentRequest,
  type GeminiGenerateContentResponse,
  type GeminiSdkClient,
} from "./geminiClient.js";

const appSource = readFileSync(
  new URL("../app/createApp.ts", import.meta.url),
  "utf8",
);
assert.equal(
  appSource.includes('@google/genai'),
  false,
  "application composition must not import the Gemini vendor SDK",
);

assert.equal(createGeminiClient({ apiKey: "" }), null);

let calls = 0;
const expected: GeminiGenerateContentResponse = {} as GeminiGenerateContentResponse;
const fakeSdk: GeminiSdkClient = {
  models: {
    async generateContent(
      _request: GeminiGenerateContentRequest,
    ): Promise<GeminiGenerateContentResponse> {
      calls += 1;
      return expected;
    },
  },
};

const client = createGeminiClient({ sdkClient: fakeSdk });
assert(client, "an injected SDK client should create the adapter");

const request = { contents: "test" } as GeminiGenerateContentRequest;
const response = await client.generateContent(request);
assert.equal(response, expected);
assert.equal(calls, 1);

console.log("Gemini client isolation tests passed");
