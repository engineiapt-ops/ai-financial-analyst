import { strict as assert } from "node:assert";
import { listAiProviders } from "./service.js";

const providers = listAiProviders();
assert.equal(providers.length, 2);
assert.deepEqual(providers[0], {
  id: "none",
  model: "deterministic",
  configured: true,
  enabled: true,
});
assert.equal(providers[1].id, "gemini");
assert.equal(typeof providers[1].model, "string");
assert.equal(typeof providers[1].configured, "boolean");
assert.equal(typeof providers[1].enabled, "boolean");

console.log("online service tests passed");
