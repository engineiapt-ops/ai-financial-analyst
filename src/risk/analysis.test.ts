import { strict as assert } from "node:assert";
import { runRiskRegimeAnalysis } from "./analysis.js";

delete process.env.DATABASE_URL;

await assert.rejects(
  () => runRiskRegimeAnalysis(1),
  /DATABASE_URL is required for repository operations/,
);

console.log("risk analysis tests passed");
