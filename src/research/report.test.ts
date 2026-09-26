import assert from "node:assert/strict";
import { buildTestAnalyzeOutput } from "./testFixtures.js";
import { buildDeterministicReport } from "./report.js";

const result = buildDeterministicReport(buildTestAnalyzeOutput(), 0, []);

assert.equal(result.recomendacao, "BUY");
assert.equal(result.fonteDecisao, "quantitativo");
assert.equal(result.riscos.length > 0, true);
assert.equal(typeof result.invalidacao, "string");
assert.ok(result.confianca >= 0 && result.confianca <= 1);

console.log("research report tests passed");

process.env.OPENAI_ANALYST_ENABLED = "false";
