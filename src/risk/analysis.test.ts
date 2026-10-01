import { strict as assert } from "node:assert";
import { runRiskRegimeAnalysis } from "./analysis.js";

process.env.DATABASE_URL = "";

await assert.rejects(
  runRiskRegimeAnalysis(999999999),
  /Run 999999999 not found/,
);

console.log("risk analysis tests passed");
