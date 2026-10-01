import { strict as assert } from "node:assert";
import { runRiskRegimeAnalysis } from "./analysis.js";

process.env.DATABASE_URL = "";

let notFound = false;
try {
  await runRiskRegimeAnalysis(999999999);
} catch (error) {
  notFound = error instanceof Error && error.message.includes("Run 999999999 not found");
}
assert.equal(notFound, true);

delete process.env.DATABASE_URL;

console.log("risk analysis tests passed");
