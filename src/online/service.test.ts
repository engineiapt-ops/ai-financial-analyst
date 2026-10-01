import { strict as assert } from "node:assert";
import { listAiProviders } from "./service.js";

const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;

try {
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_MODEL = "gemini-test-model";
  const deterministic = listAiProviders();
  assert.equal(deterministic.some((provider) => provider.id === "none" && provider.enabled), true);
  assert.equal(deterministic.some((provider) => provider.id === "gemini" && provider.configured === false), true);

  process.env.GEMINI_API_KEY = "test-key";
  const configured = listAiProviders();
  assert.equal(configured.some((provider) => provider.id === "gemini" && provider.configured && provider.model === "gemini-test-model"), true);

  console.log("online service tests passed");
} finally {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalModel;
}
