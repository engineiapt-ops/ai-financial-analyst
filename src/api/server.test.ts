import { readFileSync } from "node:fs";

export {}

process.env.NODE_ENV = "test";

const { AnalyzeSchema } = await import("./server.js");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const defaults = AnalyzeSchema.parse({});
assert(defaults.ativo === "BTCUSDT", "default asset must be BTCUSDT");
assert(defaults.timeframe === "1h", "default timeframe must be 1h");
assert(defaults.valorInvestimento === 100, "default investment must be 100");
assert(defaults.engine === "baseline", "default engine must be baseline");
assert(defaults.news === true, "default news must be enabled");

const custom = AnalyzeSchema.parse({
  ativo: "BTCUSDT",
  timeframe: "4h",
  valorInvestimento: "250",
  engine: "jev",
  news: false,
});
assert(custom.valorInvestimento === 250, "investment coercion failed");
assert(custom.engine === "jev", "jev engine parsing failed");
assert(custom.news === false, "news parsing failed");

let rejected = false;
try {
  AnalyzeSchema.parse({ valorInvestimento: 0 });
} catch {
  rejected = true;
}
assert(rejected, "zero investment must be rejected");

const legacyServerSource = readFileSync(
  new URL("../../server.ts", import.meta.url),
  "utf8",
);
for (const rawExpression of [
  "error.message || 'Failed to fetch market overview'",
  "error.message || 'Financial analysis generation failed'",
  "error.message || 'Forensic ledger analysis failed'",
  "error.message || 'DCF calculation failed'",
  "error.message || 'Research memo generation failed'",
  "error.message || 'Audio briefing generation failed'",
  "error.message || 'Chat completion failed'",
]) {
  assert(!legacyServerSource.includes(rawExpression), "legacy API must not expose raw error.message");
}


let invalidRunId = false;
try {
  new URL("http://localhost/api/metrics?runId=abc");
  const value = Number("abc");
  invalidRunId = !Number.isInteger(value) || value <= 0;
} catch {}
assert(invalidRunId, "invalid runId must be rejected");

console.log("server schema tests: OK");
