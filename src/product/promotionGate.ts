import type { ProfitabilityEvaluation } from "../evaluation/profitability.js";

export const PROMOTION_GATE_VERSION = "promotion-gate.v1";

export type PromotionStage =
  | "backtest"
  | "paper"
  | "demo_manual"
  | "real_manual";

export type PromotionDecision =
  | "blocked"
  | "paper_ready"
  | "demo_manual_ready"
  | "real_manual_ready";

export interface PromotionGateInput {
  strategy: string;
  instrument: string;
  profitability: ProfitabilityEvaluation;
  oos: {
    sampleTrades: number;
    requiredTrades: number;
    folds: number;
    requiredFolds: number;
  };
  paper: {
    realtime: boolean;
    observedTrades: number;
    requiredTrades: number;
    observedHours: number;
    requiredHours: number;
  };
  operational: {
    reliabilityPct: number;
    minimumReliabilityPct: number;
    dataFreshnessPct: number;
    minimumDataFreshnessPct: number;
  };
  drawdown: {
    maxDrawdownPct: number;
    maximumAllowedPct: number;
  };
  broker: {
    metadataVerified: boolean;
    demoAvailable: boolean;
  };
  targetStage: PromotionStage;
}

export interface PromotionGateCheck {
  key:
    | "oos-sample"
    | "oos-expectancy"
    | "oos-confidence"
    | "oos-stress"
    | "oos-drawdown"
    | "paper-realtime"
    | "operational-reliability"
    | "market-data-freshness"
    | "broker-metadata"
    | "demo-account";
  passed: boolean;
  blocking: boolean;
  message: string;
}

export interface PromotionGateReport {
  version: typeof PROMOTION_GATE_VERSION;
  decision: PromotionDecision;
  status: "ready" | "blocked";
  strategy: string;
  instrument: string;
  targetStage: PromotionStage;
  checks: PromotionGateCheck[];
  blockingReasons: string[];
  advisories: string[];
  guardrails: {
    humanExecutionOnly: true;
    automatedOrderRouting: false;
    noProfitGuarantee: true;
  };
  interpretation: {
    readyMeans: string;
    notAnInvestmentVerdict: true;
  };
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function addCheck(
  checks: PromotionGateCheck[],
  key: PromotionGateCheck["key"],
  passed: boolean,
  blocking: boolean,
  message: string,
): void {
  checks.push({ key, passed, blocking, message });
}

export function buildPromotionGate(input: PromotionGateInput): PromotionGateReport {
  if (!input.strategy.trim()) throw new Error("strategy is required");
  if (!input.instrument.trim()) throw new Error("instrument is required");

  const checks: PromotionGateCheck[] = [];

  if (
    !Number.isInteger(input.oos.requiredTrades) ||
    input.oos.requiredTrades < 1 ||
    !Number.isInteger(input.oos.requiredFolds) ||
    input.oos.requiredFolds < 1 ||
    !finiteNonNegative(input.oos.sampleTrades) ||
    !finiteNonNegative(input.oos.folds)
  ) {
    throw new Error("Invalid OOS gate thresholds");
  }

  addCheck(
    checks,
    "oos-sample",
    input.oos.sampleTrades >= input.oos.requiredTrades &&
      input.profitability.summary.sufficientSample,
    true,
    input.oos.sampleTrades >= input.oos.requiredTrades &&
      input.profitability.summary.sufficientSample
      ? `OOS sample ${input.oos.sampleTrades} >= required ${input.oos.requiredTrades} trades.`
      : `OOS sample is insufficient: ${input.oos.sampleTrades}/${input.oos.requiredTrades} trades.`,
  );

  const ci = input.profitability.summary.confidenceInterval95Pct;
  const expectancy = input.profitability.summary.expectancyPct;
  const confidencePass =
    ci !== null &&
    Number.isFinite(ci.lower) &&
    ci.lower > 0;

  addCheck(
    checks,
    "oos-expectancy",
    expectancy !== null && Number.isFinite(expectancy) && expectancy > 0,
    true,
    expectancy !== null && Number.isFinite(expectancy) && expectancy > 0
      ? `Net expectancy is positive: ${expectancy.toFixed(6)}%.`
      : "Net expectancy is not strictly positive.",
  );

  addCheck(
    checks,
    "oos-confidence",
    confidencePass,
    true,
    confidencePass
      ? `95% CI lower bound is positive: ${ci!.lower.toFixed(6)}%.`
      : "The 95% confidence interval lower bound is not strictly positive.",
  );

  const stressPass = input.profitability.stress.every(
    (scenario) => scenario.totalNetProfitPct > 0,
  );
  addCheck(
    checks,
    "oos-stress",
    stressPass,
    true,
    stressPass
      ? "All configured cost-stress scenarios remain profitable."
      : "At least one configured cost-stress scenario is non-profitable.",
  );

  const drawdownPass =
    finiteNonNegative(input.drawdown.maxDrawdownPct) &&
    finiteNonNegative(input.drawdown.maximumAllowedPct) &&
    input.drawdown.maxDrawdownPct <= input.drawdown.maximumAllowedPct;
  addCheck(
    checks,
    "oos-drawdown",
    drawdownPass,
    true,
    drawdownPass
      ? `Maximum drawdown ${input.drawdown.maxDrawdownPct}% is within the allowed ${input.drawdown.maximumAllowedPct}%.`
      : "Maximum drawdown exceeds the configured limit.",
  );

  const paperPass =
    input.paper.realtime === true &&
    input.paper.observedTrades >= input.paper.requiredTrades &&
    input.paper.observedHours >= input.paper.requiredHours;
  addCheck(
    checks,
    "paper-realtime",
    paperPass,
    input.targetStage !== "backtest",
    paperPass
      ? `Real-time paper evidence covers ${input.paper.observedTrades} trades / ${input.paper.observedHours} hours.`
      : "Real-time paper evidence is insufficient for the requested promotion stage.",
  );

  const reliabilityPass =
    Number.isFinite(input.operational.reliabilityPct) &&
    Number.isFinite(input.operational.minimumReliabilityPct) &&
    input.operational.reliabilityPct >= input.operational.minimumReliabilityPct;
  addCheck(
    checks,
    "operational-reliability",
    reliabilityPass,
    input.targetStage !== "backtest",
    reliabilityPass
      ? `Operational reliability ${input.operational.reliabilityPct}% meets the minimum ${input.operational.minimumReliabilityPct}%.`
      : "Operational reliability is below the configured minimum.",
  );

  const freshnessPass =
    Number.isFinite(input.operational.dataFreshnessPct) &&
    Number.isFinite(input.operational.minimumDataFreshnessPct) &&
    input.operational.dataFreshnessPct >= input.operational.minimumDataFreshnessPct;
  addCheck(
    checks,
    "market-data-freshness",
    freshnessPass,
    input.targetStage !== "backtest",
    freshnessPass
      ? `Market-data freshness ${input.operational.dataFreshnessPct}% meets the minimum ${input.operational.minimumDataFreshnessPct}%.`
      : "Market-data freshness is below the configured minimum.",
  );

  const brokerPass = input.broker.metadataVerified;
  addCheck(
    checks,
    "broker-metadata",
    brokerPass,
    input.targetStage === "demo_manual" || input.targetStage === "real_manual",
    brokerPass
      ? "Broker/instrument metadata is explicitly verified."
      : "Broker/instrument metadata is not verified.",
  );

  const demoPass = input.broker.demoAvailable;
  addCheck(
    checks,
    "demo-account",
    demoPass,
    input.targetStage === "demo_manual" || input.targetStage === "real_manual",
    demoPass
      ? "Demo account availability is confirmed."
      : "Demo account availability is not confirmed.",
  );

  const blockingReasons = checks
    .filter((check) => check.blocking && !check.passed)
    .map((check) => check.message);

  let decision: PromotionDecision = "blocked";
  if (blockingReasons.length === 0) {
    decision =
      input.targetStage === "real_manual"
        ? "real_manual_ready"
        : input.targetStage === "demo_manual"
          ? "demo_manual_ready"
          : input.targetStage === "paper"
            ? "paper_ready"
            : "paper_ready";
  }

  const advisories = checks
    .filter((check) => !check.blocking && !check.passed)
    .map((check) => check.message);

  return {
    version: PROMOTION_GATE_VERSION,
    decision,
    status: decision === "blocked" ? "blocked" : "ready",
    strategy: input.strategy,
    instrument: input.instrument.toUpperCase(),
    targetStage: input.targetStage,
    checks,
    blockingReasons,
    advisories,
    guardrails: {
      humanExecutionOnly: true,
      automatedOrderRouting: false,
      noProfitGuarantee: true,
    },
    interpretation: {
      readyMeans:
        "The supplied evidence satisfies the configured technical promotion checks for the requested stage. It does not authorize automated trading or guarantee future profitability.",
      notAnInvestmentVerdict: true,
    },
  };
}
