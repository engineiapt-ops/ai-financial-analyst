import {
  getWalkForwardRun,
  listOosValidationGateAudits,
} from "../db/repository.js";
import { buildPipelineAuditOverview, type PipelineAuditOverview } from "./pipelineAudit.js";
import { buildPortfolioWalkForwardReport } from "../evaluation/portfolioWalkForwardReport.js";
import { buildPortfolioRegimeDiagnostics } from "../evaluation/portfolioRegimeDiagnostics.js";
import { buildPortfolioGovernanceOverview } from "./portfolioGovernanceOverview.js";

export async function buildPipelineAuditForRun(input: {
  walkForwardRunId: number;
  auditLimit?: number;
  generatedAt?: Date;
}): Promise<PipelineAuditOverview> {
  const generatedAt = input.generatedAt ?? new Date();
  const sourceRun = await getWalkForwardRun(input.walkForwardRunId);

  if (!sourceRun) {
    throw new Error(`Walk-forward Run ${input.walkForwardRunId} not found`);
  }

  const auditLimit = input.auditLimit ?? 100;
  const [audits, portfolioReport, regimeDiagnostics] = await Promise.all([
    listOosValidationGateAudits({
      walkForwardRunId: input.walkForwardRunId,
      ativo: sourceRun.ativo,
      timeframe: sourceRun.timeframe,
      limit: auditLimit,
    }),
    buildPortfolioWalkForwardReport(input.walkForwardRunId),
    buildPortfolioRegimeDiagnostics(input.walkForwardRunId),
  ]);

  const portfolio = buildPortfolioGovernanceOverview({
    generatedAt,
    portfolioReport,
    regimeDiagnostics,
  });

  return buildPipelineAuditOverview({
    generatedAt,
    sourceRun: {
      id: sourceRun.id,
      ativo: sourceRun.ativo,
      timeframe: sourceRun.timeframe,
      candlesTotal: sourceRun.candlesTotal,
      datasetHash: sourceRun.datasetHash,
      datasetStart: sourceRun.datasetStart,
      datasetEnd: sourceRun.datasetEnd,
      initialTrainCandles: sourceRun.initialTrainCandles,
      testCandles: sourceRun.testCandles,
      stepCandles: sourceRun.stepCandles,
      lookaheadCandles: sourceRun.lookaheadCandles,
      executionModelVersion: sourceRun.executionModelVersion,
    },
    audits,
    portfolio,
  });
}
