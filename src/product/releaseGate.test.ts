import assert from "node:assert/strict";
import {
  RELEASE_GATE_REQUIRED_CONTRACTS,
  RELEASE_GATE_VERSION,
  buildReleaseGateReport,
} from "./releaseGate.js";

const report = buildReleaseGateReport({
  packageScripts: {
    build: "tsc -p .",
    test:
      "npm run test:system-readiness && npm run test:system-validation && npm run test:outcome-settlement-audit",
  },
});

assert.equal(report.version, RELEASE_GATE_VERSION);
assert.equal(report.ready, true);
assert.equal(report.contracts.length, RELEASE_GATE_REQUIRED_CONTRACTS.length);
assert.equal(new Set(report.contracts).size, report.contracts.length);
assert.ok(report.checks.every((check) => check.passed));
assert.deepEqual(report.guardrails, {
  paperTradingOnly: true,
  deterministicDecisionAuthoritative: true,
  aiAdvisoryOnly: true,
  dashboardReadOnly: true,
});

const blocked = buildReleaseGateReport({
  packageScripts: {
    build: "tsc -p .",
    test: "npm test",
  },
});

assert.equal(blocked.ready, false);
assert.equal(blocked.checks.find((check) => check.key === "test-script")?.passed, false);

console.log("release gate tests passed");
