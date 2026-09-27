import {
  getOutcomeSettlementAuditSummary,
  listResearchSnapshots,
  type OutcomeSettlementAuditSummary,
} from "../db/repository.js";
import { buildResearchIntelligenceOverview } from "../research/researchIntelligence.js";
import { buildContinuousGovernanceForRun } from "./continuousGovernanceService.js";
import { buildGovernanceDashboardForScope } from "./governanceDashboardService.js";
import {
  buildSystemValidationOverview,
  type SystemValidationOverview,
} from "./systemValidation.js";
import type { Timeframe } from "../types.js";

export async function buildSystemValidationForScope(input: {
  asset?: string;
  timeframe?: Timeframe;
  lookbackDays?: number;
  limit?: number;
  fromRun?: number;
  generatedAt?: Date;
}): Promise<SystemValidationOverview> {
  const generatedAt = input.generatedAt ?? new Date();
  const asset = input.asset?.trim().toUpperCase() || "BTCUSDT";
  const timeframe = input.timeframe ?? "1h";
  const lookbackDays = input.lookbackDays ?? 30;
  const limit = input.limit ?? 20;
  const from = new Date(generatedAt.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const dashboard = await buildGovernanceDashboardForScope({
    asset,
    timeframe,
    lookbackDays,
    limit,
    fromRun: input.fromRun,
    generatedAt,
  });

  const [settlementAudit, researchSnapshots] = await Promise.all([
    getOutcomeSettlementAuditSummary({
      ativo: asset,
      timeframe,
      from,
      to: generatedAt,
    }),
    listResearchSnapshots({
      ativo: asset,
      timeframe,
      limit: 1,
    }),
  ]);

  let researchIntelligence = null;
  const latestResearch = researchSnapshots[0];
  if (latestResearch) {
    researchIntelligence = buildResearchIntelligenceOverview({
      snapshot: latestResearch.snapshot,
      createdAt: generatedAt,
      decisionLogId: latestResearch.decisionLogId ?? 0,
    });
  }

  const continuousGovernance = input.fromRun !== undefined
    ? await buildContinuousGovernanceForRun({
        walkForwardRunId: input.fromRun,
        auditLimit: limit,
        historyLimit: Math.min(limit, 20),
        generatedAt,
        persist: false,
      })
    : null;

  return buildSystemValidationOverview({
    generatedAt,
    asset,
    timeframe,
    fromRun: input.fromRun,
    lookbackDays,
    dashboard,
    continuousGovernance,
    researchIntelligence,
    settlementAudit,
  });
}
