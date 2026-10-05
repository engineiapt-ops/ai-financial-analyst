import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};
const aggregate = String(scripts.test ?? "");

const testScripts = Object.keys(scripts)
  .filter((name) => name.startsWith("test:"))
  .sort();

const referencedTests = new Set(
  [...aggregate.matchAll(/npm run (test:[a-z0-9-]+)/g)].map((match) => match[1]),
);

const missing = testScripts.filter((name) => !referencedTests.has(name));

if (missing.length > 0) {
  console.error("Aggregate test manifest is incomplete.");
  console.error("Missing test scripts:");
  for (const name of missing) console.error(`- ${name}`);
  process.exit(1);
}

console.log(
  `Aggregate test manifest OK: ${testScripts.length} test scripts declared and ${referencedTests.size} referenced.`,
);
