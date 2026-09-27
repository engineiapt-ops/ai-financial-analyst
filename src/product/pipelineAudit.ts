import { createHash } from "node:crypto";
import type { OosValidationGateAuditRecord } from "../db/repository.js";
import type { OperationalQualityOverview } from "./operationalQuality.js";
import type { PortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";

export const PIPELINE_AUDIT_VERSION = "pipeline-audit.v1";

export type PipelineAuditState = "ready" | "degraded" | "blocked";

export interface PipelineSourceRun {
  id: number;
  ativo: string;
  timeframe: "1h" | "4h" | "1d";
  candlesTotal: number;
  datasetHash: string;
  datasetStart: Date;
  datasetEnd: Date;
  initialTrainCandles: number;
  testCandles: number;
  stepCandles: number;
  lookaheadCandles: number;
  executionModelVersion: string;
}

export interface PipelineAuditCheck {
  key: string;
  passed: boolean;
  blocking: boolean;
  message: string;
}

export interface PipelineAuditLatestOosAudit {
  strategy: OosValidationGateAuditRecord["estrategia"];
  id: number;
  status: OosValidationGateAuditRecord["status"];
  walkForwardRunId: number | null;
  evidenceHash: string;
  createdAt: string;
}

export interface PipelineAuditOverview {
  version: typeof PIPELINE_AUDIT_VERSION;
  generatedAt: string;
  state: PipelineAuditState;
  scope: {
    walkForwardRunId: number | null;
    asset: string | null;
    timeframe: string | null;
    datasetHash: string | null;
    candlesTotal: number | null;
  };
  traceability: {
    dataset: {
      present: boolean;
      hash: string | null;
      candlesTotal: number | null;
    };
    oos: {
      auditCount: number;
      latestByStrategy: PipelineAuditLatestOosAudit[];
      requiredStrategies: string[];
    };
    portfolio: {
      available: boolean;
      walkForwardRunId: number | null;
      datasetHash: string | null;
      foldCount: number;
      stabilityCoveragePct: number | null;
      contractVersion: string | null;
    };
    product: {
      operationalQualityVersion: string | null;
      operationalQualityState: OperationalQualityOverview["state"] | null;
    };
  };
  checks: PipelineAuditCheck[];
  blockingReasons: string[];
  warnings: string[];
  evidenceHash: string;
  interpretation: {
    readyMeans: string;
    notAnInvestmentVerdict: true;
  };
}

export type PipelineRegressionKind =
  | "state-regression"
  | "oos-status-regression"
  | "portfolio-integrity-regression"
  | "stability-coverage-regression"
  | "contract-drift"
  | "scope-change";

export interface PipelineRegressionEvent {
  kind: PipelineRegressionKind;
  severity: "blocking" | "warning" | "info";
  strategy?: string;
  message: string;
}

export interface PipelineRegressionReport {
  comparable: boolean;
  regressed: boolean;
  events: PipelineRegressionEvent[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((item) => stableJson(item)).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item))
        .join(",") +
      "}";
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function latestOosAudits(
  audits: OosValidationGateAuditRecord[],
): PipelineAuditLatestOosAudit[] {
  const sorted = [...audits].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  );
  const latest = new Map<string, PipelineAuditLatestOosAudit>();

  for (const audit of sorted) {
    if (latest.has(audit.estrategia)) continue;
    latest.set(audit.estrategia, {
      strategy: audit.estrategia,
      id: audit.id,
      status: audit.status,
      walkForwardRunId: audit.walkForwardRunId,
      evidenceHash: audit.evidenceHash,
      createdAt: audit.createdAt.toISOString(),
    });
  }

  return [...latest.values()].sort((a, b) => a.strategy.localeCompare(b.strategy));
}

export function buildPipelineAuditOverview(input: {
  generatedAt: Date;
  sourceRun: PipelineSourceRun | null;
  audits: OosValidationGateAuditRecord[];
  portfolio?: PortfolioGovernanceOverview | null;
  operationalQuality?: OperationalQualityOverview | null;
}): PipelineAuditOverview {
  const latest = latestOosAudits(input.audits);
  const requiredStrategies =
    input.portfolio?.portfolio.strategies.map((strategy) => strategy.strategy).sort() ?? [];

  const portfolioFoldCount = input.portfolio?.portfolio.foldCount ?? 0;
  const stabilityValues =
    input.portfolio?.portfolio.strategies.map((strategy) => strategy.stability.foldCount) ?? [];
  const stabilityCoveragePct =
    stabilityValues.length > 0 && portfolioFoldCount > 0
      ? (Math.min(...stabilityValues) / portfolioFoldCount) * 100
      : null;

  const checks: PipelineAuditCheck[] = [];
  const addCheck = (
    key: string,
    passed: boolean,
    blocking: boolean,
    message: string,
  ) => checks.push({ key, passed, blocking, message });

  addCheck(
    "source-run",
    Boolean(input.sourceRun),
    true,
    input.sourceRun
      ? "Walk-forward run " + input.sourceRun.id + " is identified."
      : "Walk-forward run was not found.",
  );

  const datasetPresent = Boolean(
    input.sourceRun &&
      input.sourceRun.candlesTotal > 0 &&
      /^[0-9a-f]{64}$/.test(input.sourceRun.datasetHash),
  );

  addCheck(
    "dataset-integrity",
    datasetPresent,
    true,
    datasetPresent
      ? "Dataset hash and candle-count metadata are present."
      : "Dataset hash/candle-count metadata is incomplete or invalid.",
  );

  const linkedAudits = latest.filter(
    (audit) =>
      input.sourceRun !== null &&
      audit.walkForwardRunId === input.sourceRun.id,
  );

  addCheck(
    "oos-linkage",
    input.sourceRun !== null &&
      latest.length > 0 &&
      linkedAudits.length === latest.length &&
      latest.every(
        (audit) =>
          audit.walkForwardRunId === input.sourceRun!.id &&
          audit.status === "ready" &&
          /^[0-9a-f]{64}$/.test(audit.evidenceHash),
      ),
    true,
    input.sourceRun && linkedAudits.length === latest.length && latest.length > 0
      ? "Latest OOS audits are linked to the selected walk-forward run and have valid evidence hashes."
      : "One or more latest OOS audits are missing, unlinked, blocked, or carry an invalid evidence hash.",
  );

  const requiredCoverage =
    requiredStrategies.length === 0
      ? latest.length > 0
      : requiredStrategies.every((strategy) =>
          latest.some((audit) => audit.strategy === strategy),
        );

  addCheck(
    "oos-coverage",
    requiredCoverage,
    Boolean(input.portfolio),
    requiredCoverage
      ? "OOS audit coverage exists for the strategies represented by the portfolio contract."
      : "At least one portfolio strategy has no corresponding latest OOS audit.",
  );

  if (input.sourceRun && latest.length > 0) {
    const scopeAligned = latest.every(
      (audit) => audit.walkForwardRunId === input.sourceRun!.id,
    );
    addCheck(
      "oos-scope",
      scopeAligned,
      true,
      scopeAligned
        ? "OOS audit linkage matches the selected walk-forward run."
        : "OOS audit linkage does not match the selected walk-forward run.",
    );
  } else {
    addCheck(
      "oos-scope",
      false,
      false,
      "OOS scope cannot be fully checked without a source run and audits.",
    );
  }

  const portfolioAvailable = Boolean(input.portfolio);
  addCheck(
    "portfolio-available",
    portfolioAvailable,
    false,
    portfolioAvailable
      ? "Portfolio governance contract is available."
      : "Portfolio governance contract is not available for this audit.",
  );

  if (input.portfolio && input.sourceRun) {
    const portfolioScopeAligned =
      input.portfolio.scope.walkForwardRunId === input.sourceRun.id &&
      input.portfolio.scope.asset.toUpperCase() === input.sourceRun.ativo.toUpperCase() &&
      input.portfolio.scope.timeframe === input.sourceRun.timeframe &&
      input.portfolio.scope.datasetHash === input.sourceRun.datasetHash;

    addCheck(
      "portfolio-scope",
      portfolioScopeAligned,
      true,
      portfolioScopeAligned
        ? "Portfolio scope matches the source run and dataset hash."
        : "Portfolio scope does not match the source walk-forward run or dataset hash.",
    );

    addCheck(
      "portfolio-integrity",
      input.portfolio.portfolio.allChecksPassed,
      true,
      input.portfolio.portfolio.allChecksPassed
        ? "All persisted portfolio integrity checks passed."
        : "One or more persisted portfolio integrity checks failed.",
    );

    addCheck(
      "stability-coverage",
      stabilityCoveragePct !== null && stabilityCoveragePct >= 100,
      true,
      stabilityCoveragePct !== null && stabilityCoveragePct >= 100
        ? "Portfolio stability coverage is complete across persisted folds."
        : "Portfolio stability coverage is incomplete.",
    );
  } else {
    addCheck(
      "portfolio-scope",
      false,
      false,
      "Portfolio scope cannot be checked because the portfolio contract is unavailable.",
    );
    addCheck(
      "portfolio-integrity",
      false,
      false,
      "Portfolio integrity cannot be checked because the portfolio contract is unavailable.",
    );
    addCheck(
      "stability-coverage",
      false,
      false,
      "Stability coverage cannot be checked because the portfolio contract is unavailable.",
    );
  }

  const executionModelPresent = Boolean(
    input.sourceRun?.executionModelVersion?.trim(),
  );
  addCheck(
    "execution-model",
    executionModelPresent,
    true,
    executionModelPresent
      ? "Execution model " + input.sourceRun!.executionModelVersion + " is registered on the source run."
      : "The source run does not identify an execution model.",
  );

  const operationalQualityAligned =
    input.operationalQuality === null || input.operationalQuality === undefined
      ? true
      : input.operationalQuality.scope.portfolioRunId === null ||
          input.operationalQuality.scope.portfolioRunId === input.sourceRun?.id;

  addCheck(
    "product-scope",
    operationalQualityAligned,
    true,
    operationalQualityAligned
      ? "Product-level operational quality scope is compatible with this pipeline run."
      : "Product-level operational quality scope points to a different portfolio run.",
  );

  const contractVersionsAligned =
    latest.every((audit) => audit.gateVersion === "oos-validation-gate.v1") &&
    (!input.portfolio ||
      input.portfolio.version === "portfolio-governance-overview.v2") &&
    (!input.portfolio ||
      input.portfolio.portfolio.strategies.every(
        (strategy) => strategy.stability.version === "portfolio-stability.v1",
      )) &&
    (!input.operationalQuality ||
      input.operationalQuality.version === "operational-quality.v1");

  addCheck(
    "contract-versions",
    contractVersionsAligned,
    true,
    contractVersionsAligned
      ? "All observed pipeline contracts match the expected governance versions."
      : "One or more observed pipeline contracts have unexpected versions.",
  );

  const blockingReasons = checks
    .filter((check) => check.blocking && !check.passed)
    .map((check) => check.message);
  const warnings = checks
    .filter((check) => !check.blocking && !check.passed)
    .map((check) => check.message);

  const state: PipelineAuditState =
    blockingReasons.length > 0
      ? "blocked"
      : warnings.length > 0
        ? "degraded"
        : "ready";

  const evidenceHash = sha256({
    version: PIPELINE_AUDIT_VERSION,
    state,
    scope: {
      walkForwardRunId: input.sourceRun?.id ?? null,
      asset: input.sourceRun?.ativo?.toUpperCase() ?? null,
      timeframe: input.sourceRun?.timeframe ?? null,
      datasetHash: input.sourceRun?.datasetHash ?? null,
      candlesTotal: input.sourceRun?.candlesTotal ?? null,
    },
    oos: latest.map((audit) => ({
      strategy: audit.strategy,
      id: audit.id,
      status: audit.status,
      walkForwardRunId: audit.walkForwardRunId,
      evidenceHash: audit.evidenceHash,
    })),
    portfolio: input.portfolio
      ? {
          version: input.portfolio.version,
          walkForwardRunId: input.portfolio.scope.walkForwardRunId,
          datasetHash: input.portfolio.scope.datasetHash,
          foldCount: input.portfolio.portfolio.foldCount,
          stabilityCoveragePct,
          allChecksPassed: input.portfolio.portfolio.allChecksPassed,
        }
      : null,
    checks,
  });

  return {
    version: PIPELINE_AUDIT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    state,
    scope: {
      walkForwardRunId: input.sourceRun?.id ?? null,
      asset: input.sourceRun?.ativo?.toUpperCase() ?? null,
      timeframe: input.sourceRun?.timeframe ?? null,
      datasetHash: input.sourceRun?.datasetHash ?? null,
      candlesTotal: input.sourceRun?.candlesTotal ?? null,
    },
    traceability: {
      dataset: {
        present: datasetPresent,
        hash: input.sourceRun?.datasetHash ?? null,
        candlesTotal: input.sourceRun?.candlesTotal ?? null,
      },
      oos: {
        auditCount: input.audits.length,
        latestByStrategy: latest,
        requiredStrategies,
      },
      portfolio: {
        available: portfolioAvailable,
        walkForwardRunId: input.portfolio?.scope.walkForwardRunId ?? null,
        datasetHash: input.portfolio?.scope.datasetHash ?? null,
        foldCount: portfolioFoldCount,
        stabilityCoveragePct,
        contractVersion: input.portfolio?.version ?? null,
      },
      product: {
        operationalQualityVersion: input.operationalQuality?.version ?? null,
        operationalQualityState: input.operationalQuality?.state ?? null,
      },
    },
    checks,
    blockingReasons,
    warnings,
    evidenceHash,
    interpretation: {
      readyMeans: "The persisted dataset, OOS evidence and portfolio governance artifacts are structurally traceable and internally aligned.",
      notAnInvestmentVerdict: true,
    },
  };
}

function stateSeverity(state: PipelineAuditState): number {
  return state === "ready" ? 0 : state === "degraded" ? 1 : 2;
}

export function comparePipelineAudits(
  previous: PipelineAuditOverview,
  current: PipelineAuditOverview,
): PipelineRegressionReport {
  const comparable =
    previous.scope.asset !== null &&
    current.scope.asset !== null &&
    previous.scope.timeframe !== null &&
    current.scope.timeframe !== null &&
    previous.scope.asset === current.scope.asset &&
    previous.scope.timeframe === current.scope.timeframe;

  const events: PipelineRegressionEvent[] = [];

  if (!comparable) {
    events.push({
      kind: "scope-change",
      severity: "info",
      message: "Previous and current audits use different asset/timeframe scopes.",
    });
  }

  if (stateSeverity(current.state) > stateSeverity(previous.state)) {
    events.push({
      kind: "state-regression",
      severity: "blocking",
      message: "Pipeline state regressed from " + previous.state + " to " + current.state + ".",
    });
  }

  const previousOos = new Map(
    previous.traceability.oos.latestByStrategy.map((audit) => [audit.strategy, audit]),
  );
  const currentOos = new Map(
    current.traceability.oos.latestByStrategy.map((audit) => [audit.strategy, audit]),
  );

  for (const [strategy, before] of previousOos) {
    const after = currentOos.get(strategy);
    if (before.status === "ready" && after?.status === "blocked") {
      events.push({
        kind: "oos-status-regression",
        severity: "blocking",
        strategy,
        message: "OOS governance for " + strategy + " regressed from ready to blocked.",
      });
    }
  }

  const previousPortfolioPassed =
    previous.checks.find((check) => check.key === "portfolio-integrity")?.passed ?? false;
  const currentPortfolioPassed =
    current.checks.find((check) => check.key === "portfolio-integrity")?.passed ?? false;

  if (previousPortfolioPassed && !currentPortfolioPassed) {
    events.push({
      kind: "portfolio-integrity-regression",
      severity: "blocking",
      message: "Portfolio integrity regressed from passing to failing.",
    });
  }

  const previousCoverage = previous.traceability.portfolio.stabilityCoveragePct;
  const currentCoverage = current.traceability.portfolio.stabilityCoveragePct;
  if (
    previousCoverage !== null &&
    currentCoverage !== null &&
    currentCoverage < previousCoverage
  ) {
    events.push({
      kind: "stability-coverage-regression",
      severity: "blocking",
      message: "Portfolio stability coverage fell from " + previousCoverage + "% to " + currentCoverage + "%.",
    });
  }

  if (
    previous.traceability.portfolio.contractVersion !== null &&
    current.traceability.portfolio.contractVersion !== null &&
    previous.traceability.portfolio.contractVersion !== current.traceability.portfolio.contractVersion
  ) {
    events.push({
      kind: "contract-drift",
      severity: "warning",
      message: "Portfolio governance contract changed from " +
        previous.traceability.portfolio.contractVersion + " to " +
        current.traceability.portfolio.contractVersion + ".",
    });
  }

  if (
    previous.traceability.dataset.hash !== null &&
    current.traceability.dataset.hash !== null &&
    previous.traceability.dataset.hash !== current.traceability.dataset.hash
  ) {
    events.push({
      kind: "scope-change",
      severity: "info",
      message: "Dataset hash changed between the compared audits; this is a new evaluation scope, not a trading-performance judgment.",
    });
  }

  return {
    comparable,
    regressed: events.some((event) => event.severity === "blocking"),
    events,
  };
}
