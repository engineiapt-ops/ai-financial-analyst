import { strict as assert } from "node:assert";
import { GeminiProvider, GeminiProviderError } from "./geminiProvider.js";
import { buildOnlineAnalysisPacket } from "../online/provenance.js";
import { buildTestAnalyzeOutput } from "../research/testFixtures.js";
import { buildDeterministicReport } from "../research/report.js";
import { buildResearchSnapshot } from "../research/snapshot.js";

const analysis = buildTestAnalyzeOutput();
const research = {
  asOf: new Date(analysis.market.dataAsOf).toISOString(),
  sentiment: 0,
  evidence: [],
  sources: [],
  report: buildDeterministicReport(analysis, 0, []),
};
const snapshot = buildResearchSnapshot(analysis, research);
const packet = buildOnlineAnalysisPacket(analysis, research, snapshot);

const okProvider = new GeminiProvider({
  apiKey: "test-key",
  model: "gemini-3.8-flash",
  baseUrl: "https://example.test/v1beta",
  fetchImpl: async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.contents[0].role, "user");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              summary: "Contexto contextual.",
              keyDrivers: ["EMA9 acima da EMA21."],
              riskFlags: ["RSI permanece relevante para acompanhamento."],
              watchItems: ["Próximo candle fechado."],
              confidenceNote: "A confiança pertence ao motor determinístico.",
            }),
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
});

const result = await okProvider.analyze(packet);
assert.equal(result.provider, "gemini");
assert.equal(result.model, "gemini-3.8-flash");
assert.equal(result.inputPacketId, packet.packetId);
assert.equal(result.narrative.keyDrivers.length, 1);

const missingKey = new GeminiProvider({ apiKey: "" });
await assert.rejects(
  missingKey.analyze(packet),
  (error: unknown) => error instanceof GeminiProviderError && /GEMINI_API_KEY/.test(error.message),
);

console.log("gemini provider tests passed");
