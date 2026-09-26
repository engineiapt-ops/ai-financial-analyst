import assert from "node:assert/strict";
import { buildTestAnalyzeOutput } from "./testFixtures.js";
import { generateAnalystReport } from "./report.js";

const result = await generateAnalystReport(buildTestAnalyzeOutput());

assert.equal(result.report.recomendacao, "BUY");
assert.equal(result.report.fonteDecisao, "quantitativo");
assert.equal(result.report.riscos.length > 0, true);
assert.equal(typeof result.report.invalidação, "string");
assert.ok(result.report.confianca >= 0 && result.report.confianca <= 1);

console.log("research report tests passed");
