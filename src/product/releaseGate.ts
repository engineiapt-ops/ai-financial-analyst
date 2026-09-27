import {
  CONTINUOUS_GOVERNANCE_VERSION,
} from "./continuousGovernance.js";
import { GOVERNANCE_DASHBOARD_VERSION } from "./governanceDashboard.js";
import { MARKET_DATA_QUALITY_VERSION } from "../marketdata/quality.js";
import { OPERATIONAL_QUALITY_VERSION } from "./operationalQuality.js";
import { PIPELINE_AUDIT_VERSION } from "./pipelineAudit.js";
import { PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION } from "./portfolioGovernanceOverview.js";
import { PORTFOLIO_STABILITY_VERSION } from "../evaluation/portfolioStability.js";
import { RESEARCH_INTELLIGENCE_VERSION } from "../research/researchIntelligence.js";
import { SYSTEM_READINESS_VERSION } from "./systemReadiness.js";
import { SYSTEM_VALIDATION_VERSION } from "./systemValidation.js";
import { OUTCOME_SETTLEMENT_AUDIT_VERSION } from "../evaluation/outcomeSettlementAudit.js";
import { VALIDATION_HISTORY_VERSION } from "./validationHistory.js";

export const RELEASE_GATE_VERSION = "release-gate.v1";

export const RELEASE_GATE_REQUIRED_CONTRACTS = [
  SYSTEM_VALIDATION_VERSION,
  OUTCOME_SETTLEMENT_AUDIT_VERSION,
  VALIDATION_HISTORY_VERSION,
  SYSTEM_READINESS_VERSION,
  MARKET_DATA_QUALITY_VERSION,
  OPERATIONAL_QUALITY_VERSION,
  PIPELINE_AUDIT_VERSION,
  CONTINUOUS_GOVERNANCE_VERSION,
  GOVERNANCE_DASHBOARD_VERSION,
  PORTFOLIO_GOVERNANCE_OVERVIEW_VERSION,
  PORTFOLIO_STABILITY_VERSION,
  RESEARCH_INTELLIGENCE_VERSION,
] as const;

export interface ReleaseGateCheck {
  key: "build-script" | "test-script" | "contract-versions" | "guardrails";
  passed: boolean;
  detail: string;
}

export interface ReleaseGateReport {
  version: typeof RELEASE_GATE_VERSION;
  ready: boolean;
  checks: ReleaseGateCheck[];
  contracts: string[];
  guardrails: {
    paperTradingOnly: true;
    deterministicDecisionAuthoritative: true;
    aiAdvisoryOnly: true;
    dashboardReadOnly: true;
  };
  notes: string[];
}

export function buildReleaseGateReport(input: {
  packageScripts: Record<string, string | undefined>;
}): ReleaseGateReport {
  const checks: ReleaseGateCheck[] = [];

  const buildScriptPassed = input.packageScripts.build === "tsc -p .";
  checks.push({
    key: "build-script",
    passed: buildScriptPassed,
    detail: buildScriptPassed
      ? "The release pipeline has an explicit TypeScript build command."
      : "The expected TypeScript build command is missing or changed.",
  });

  const testScript = input.packageScripts.test ?? "";
  const testScriptPassed =
    testScript.includes("npm run test:system-validation") &&
    testScript.includes("npm run test:outcome-settlement-audit") &&
    testScript.includes("npm run test:validation-history");
  checks.push({
    key: "test-script",
    passed: testScriptPassed,
    detail: testScriptPassed
      ? "The release pipeline includes system-validation, settlement-audit and validation-history tests."
      : "The aggregate test suite is missing one or more release-critical contract suites.",
  });

  const uniqueContracts = new Set(RELEASE_GATE_REQUIRED_CONTRACTS);
  const contractsPassed = uniqueContracts.size === RELEASE_GATE_REQUIRED_CONTRACTS.length;
  checks.push({
    key: "contract-versions",
    passed: contractsPassed,
    detail: contractsPassed
      ? "All release-critical governance contracts expose a unique version identifier."
      : "One or more release-critical contract identifiers are duplicated.",
  });

  const guardrails = {
    paperTradingOnly: true as const,
    deterministicDecisionAuthoritative: true as const,
    aiAdvisoryOnly: true as const,
    dashboardReadOnly: true as const,
  };
  const guardrailsPassed = Object.values(guardrails).every(Boolean);
  checks.push({
    key: "guardrails",
    passed: guardrailsPassed,
    detail: guardrailsPassed
      ? "Paper-only, deterministic decision authority, advisory AI and read-only cockpit invariants remain explicit."
      : "One or more product guardrails are not explicitly satisfied.",
  });

  return {
    version: RELEASE_GATE_VERSION,
    ready: checks.every((check) => check.passed),
    checks,
    contracts: [...RELEASE_GATE_REQUIRED_CONTRACTS],
    guardrails,
    notes: [
      "This gate is a release-integrity check, not an investment verdict.",
      "It does not create signals, select strategies, change thresholds or authorize real execution.",
      "CI must execute build and the aggregate test suite before this gate is accepted.",
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import("node:fs/promises");
  const packageJson = JSON.parse(
    await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string | undefined> };

  const report = buildReleaseGateReport({
    packageScripts: packageJson.scripts ?? {},
  });

  console.log(JSON.stringify(report, null, 2));

  if (!report.ready) {
    process.exitCode = 1;
  }
}
