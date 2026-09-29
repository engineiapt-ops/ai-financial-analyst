import assert from "node:assert/strict";
import {
  RELEASE_GATE_REQUIRED_CONTRACTS,
  RELEASE_GATE_REQUIRED_TESTS,
  RELEASE_GATE_VERSION,
  buildReleaseGateReport,
} from "./releaseGate.js";

const completeTestScript = RELEASE_GATE_REQUIRED_TESTS.join(" && ");

const report = buildReleaseGateReport({
  packageScripts: {
    build: "tsc -p .",
    test: completeTestScript,
  },
});

assert.equal(report.version, RELEASE_GATE_VERSION);
assert.equal(report.ready, true);
assert.equal(report.contracts.length, RELEASE_GATE_REQUIRED_CONTRACTS.length);
assert.equal(new Set(report.contracts).size, report.contracts.length);
assert.equal(RELEASE_GATE_REQUIRED_TESTS.length, 15);
assert.ok(report.checks.every((check) => check.passed));
assert.deepEqual(report.guardrails, {
  paperTradingOnly: true,
  deterministicDecisionAuthoritative: true,
  aiAdvisoryOnly: true,
  dashboardReadOnly: true,
});

const missingE2E = buildReleaseGateReport({
  packageScripts: {
    build: "tsc -p .",
    test: completeTestScript.replace("npm run test:paper-e2e && ", ""),
  },
});

assert.equal(missingE2E.ready, false);
assert.match(
  missingE2E.checks.find((check) => check.key === "test-script")?.detail ?? "",
  /test:paper-e2e/,
);

const missingHardening = buildReleaseGateReport({
  packageScripts: {
    build: "tsc -p .",
    test: completeTestScript.replace("npm run test:runtime-config && ", ""),
  },
});

assert.equal(missingHardening.ready, false);
assert.match(
  missingHardening.checks.find((check) => check.key === "test-script")?.detail ?? "",
  /test:runtime-config/,
);

console.log("release gate tests passed");
