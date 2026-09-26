import type { CalibrationReport } from "../evaluation/calibration.js";
import type { DecisionKpis } from "../db/repository.js";

export const EVALUATION_OVERVIEW_VERSION = "evaluation-overview.v1";

export interface EvaluationOverviewAudit {
  id: number;
  strategy: string;
  status: string;
  evidenceHash: string;
  createdAt: string;
  verified: boolean | null;
}

export interface EvaluationOverview {
  version: typeof EVALUATION_OVERVIEW_VERSION;
  generatedAt: string;
  period: {
    from: string;
    to: string;
  };
  filters: {
    ativo: string | null;
    timeframe: string | null;
  };
  decisionQuality: {
    totalDecisions: number;
    settledDecisions: number;
    pendingDecisions: number;
    winRate: number | null;
    avgForwardReturnPercent: number | null;
    avgTradeProfitPercent: number | null;
    totalTradeProfitPercent: number;
    avgConfidence: number | null;
    avgQualityScore: number | null;
  };
  calibration: {
    sampleCount: number;
    sufficientSample: boolean;
    brierScore: number | null;
    expectedCalibrationError: number | null;
  };
  governance: {
    auditCount: number;
    latestByStrategy: EvaluationOverviewAudit[];
    readyCount: number;
    blockedCount: number;
  };
}

export function buildEvaluationOverview(input: {
  generatedAt: Date;
  from: Date;
  to: Date;
  ativo?: string;
  timeframe?: string;
  kpis: DecisionKpis;
  calibration: CalibrationReport;
  audits: Array<{
    id: number;
    estrategia: string;
    status: string;
    evidenceHash: string;
    createdAt: Date;
  }>;
}): EvaluationOverview {
  const latest = new Map<string, EvaluationOverviewAudit>();

  for (const audit of input.audits) {
    if (latest.has(audit.estrategia)) continue;
    latest.set(audit.estrategia, {
      id: audit.id,
      strategy: audit.estrategia,
      status: audit.status,
      evidenceHash: audit.evidenceHash,
      createdAt: audit.createdAt.toISOString(),
      verified: null,
    });
  }

  return {
    version: EVALUATION_OVERVIEW_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    period: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    },
    filters: {
      ativo: input.ativo?.trim().toUpperCase() || null,
      timeframe: input.timeframe || null,
    },
    decisionQuality: {
      totalDecisions: input.kpis.summary.totalDecisions,
      settledDecisions: input.kpis.summary.settledDecisions,
      pendingDecisions: input.kpis.summary.pendingDecisions,
      winRate: input.kpis.summary.winRate,
      avgForwardReturnPercent: input.kpis.summary.avgForwardReturnPercent,
      avgTradeProfitPercent: input.kpis.summary.avgTradeProfitPercent,
      totalTradeProfitPercent: input.kpis.summary.totalTradeProfitPercent,
      avgConfidence: input.kpis.summary.avgConfidence,
      avgQualityScore: input.kpis.summary.avgQualityScore,
    },
    calibration: {
      sampleCount: input.calibration.sampleCount,
      sufficientSample: input.calibration.sufficientSample,
      brierScore: input.calibration.confidence.brierScore,
      expectedCalibrationError: input.calibration.confidence.expectedCalibrationError,
    },
    governance: {
      auditCount: input.audits.length,
      latestByStrategy: [...latest.values()],
      readyCount: input.audits.filter((audit) => audit.status === "ready").length,
      blockedCount: input.audits.filter((audit) => audit.status === "blocked").length,
    },
  };
}
