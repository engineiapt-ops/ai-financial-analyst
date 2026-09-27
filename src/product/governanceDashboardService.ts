import type { Timeframe } from "../types.js";
import {
  getDecisionCalibrationObservations,
  getDecisionKpis,
  getWalkForwardRun,
  healthDatabase,
  listOosValidationGateAudits,
  listPipelineAuditSnapshots,
} from "../db/repository.js";
import { fetchKlines, ping as pingBinance } from "../marketdata/binanceClient.js";
import { evaluateMarketDataQuality } from "../marketdata/quality.js";
import { buildCalibrationReport } from "../evaluation/calibration.js";
import { buildEvaluationOverview } from "./evaluationOverview.js";
import { buildOperationalQualityOverview } from "./operationalQuality.js";
import { buildPortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";
import { buildSystemReadinessOverview } from "./systemReadiness.js";
import { buildPipelineAuditForRun } from "./pipelineAuditService.js";
import { comparePipelineAudits } from "./pipelineAudit.js";
import type { GovernanceDashboardHistoryItem } from "./governanceDashboard.js";
import { buildGovernanceDashboardOverview, type GovernanceDashboardOverview } from "./governanceDashboard.js";
import { listAiProviders } from "../ai/providers.js";
import { inspectRuntimeConfig } from "../api/runtimeConfig.js";

export async function buildGovernanceDashboardForScope(input: {
  asset?: string;
  timeframe?: Timeframe;
  lookbackDays?: number;
  limit?: number;
  fromRun?: number;
  generatedAt?: Date;
}): Promise<GovernanceDashboardOverview> {
  const generatedAt = input.generatedAt ?? new Date();
  const asset = input.asset?.trim().toUpperCase() || "BTCUSDT";
  const timeframe = input.timeframe ?? "1h";
  const lookbackDays = input.lookbackDays ?? 30;
  const limit = input.limit ?? 20;
  const from = new Date(generatedAt.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const [
    marketDataCheck,
    databaseCheck,
    marketKlines,
    kpis,
    observations,
    audits,
  ] = await Promise.all([
    pingBinance()
      .then((ok) => ({ available: ok, detail: ok ? "Binance ping OK" : "Binance ping failed" }))
      .catch((error: unknown) => ({
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      })),
    healthDatabase()
      .then(() => ({ available: true, detail: "Database query OK" }))
      .catch((error: unknown) => ({
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      })),
    fetchKlines(asset, timeframe, 2).catch(() => []),
    getDecisionKpis({ ativo: asset, timeframe, from, to: generatedAt }),
    getDecisionCalibrationObservations({ ativo: asset, timeframe, from, to: generatedAt }),
    listOosValidationGateAudits({
      ativo: asset,
      timeframe,
      strategy: undefined,
      limit,
    }),
  ]);

  const system = buildSystemReadinessOverview({
    generatedAt,
    marketData: marketDataCheck,
    database: databaseCheck,
    aiProviders: listAiProviders(),
    paperTradingOnly: true,
    apiAuthenticationConfigured: Boolean(process.env.API_AUTH_TOKEN?.trim()),
    runtimeConfig: inspectRuntimeConfig(),
    governanceContracts: [
      "evaluation-overview.v1",
      "operational-quality.v1",
      "pipeline-audit.v1",
      "pipeline-audit-history.v1",
      "governance-dashboard.v1",
    ],
  });

  const marketData = evaluateMarketDataQuality({
    timeframe,
    candles: marketKlines,
    checkedAt: generatedAt,
  });

  const evaluation = buildEvaluationOverview({
    generatedAt,
    from,
    to: generatedAt,
    ativo: asset,
    timeframe,
    kpis,
    calibration: buildCalibrationReport(observations, {
      ativo: asset,
      timeframe,
      from,
      to: generatedAt,
    }),
    audits,
  });

  let portfolio;
  let pipelineAudit = null;
  let pipelineHistory: GovernanceDashboardHistoryItem[] = [];

  if (input.fromRun !== undefined) {
    const sourceRun = await getWalkForwardRun(input.fromRun);
    if (!sourceRun) {
      throw new Error(`Walk-forward Run ${input.fromRun} not found`);
    }

    const [portfolioReport, regimeDiagnostics, audit, snapshots] = await Promise.all([
      import("../evaluation/portfolioWalkForwardReport.js").then((module) =>
        module.buildPortfolioWalkForwardReport(input.fromRun!),
      ),
      import("../evaluation/portfolioRegimeDiagnostics.js").then((module) =>
        module.buildPortfolioRegimeDiagnostics(input.fromRun!),
      ),
      buildPipelineAuditForRun({
        walkForwardRunId: input.fromRun,
        auditLimit: limit,
        generatedAt,
      }),
      listPipelineAuditSnapshots({
        walkForwardRunId: input.fromRun,
        limit,
      }),
    ]);

    portfolio = buildPortfolioGovernanceOverview({
      generatedAt,
      portfolioReport,
      regimeDiagnostics,
    });

    pipelineAudit = audit;

    const chronological = [...snapshots].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
    );

    pipelineHistory = chronological.map((snapshot, index) => {
      const previous = chronological[index - 1];
      return {
        snapshotId: snapshot.id,
        createdAt: snapshot.createdAt.toISOString(),
        state: snapshot.state,
        evidenceHash: snapshot.evidenceHash,
        datasetHash: snapshot.datasetHash,
        regressionFromPrevious: previous
          ? comparePipelineAudits(previous.snapshot, snapshot.snapshot)
          : null,
      };
    });
  }

  const operationalQuality = buildOperationalQualityOverview({
    generatedAt,
    asset,
    timeframe,
    portfolioRunId: input.fromRun,
    readiness: system,
    marketData,
    evaluation,
    portfolio,
  });

  return buildGovernanceDashboardOverview({
    generatedAt,
    asset,
    timeframe,
    lookbackDays,
    system,
    marketData,
    evaluation,
    operationalQuality,
    portfolio,
    pipelineAudit,
    pipelineHistory,
  });
}
