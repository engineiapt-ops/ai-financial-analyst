import {
  listPipelineAuditSnapshots,
  savePipelineAuditSnapshot,
} from "../db/repository.js";
import { buildPipelineAuditForRun } from "./pipelineAuditService.js";
import { comparePipelineAudits } from "./pipelineAudit.js";
import {
  buildContinuousGovernanceOverview,
  type ContinuousGovernanceOverview,
} from "./continuousGovernance.js";

export async function buildContinuousGovernanceForRun(input: {
  walkForwardRunId: number;
  auditLimit?: number;
  historyLimit?: number;
  generatedAt?: Date;
  persist?: boolean;
}): Promise<ContinuousGovernanceOverview> {
  const generatedAt = input.generatedAt ?? new Date();
  const auditLimit = input.auditLimit ?? 100;
  const historyLimit = input.historyLimit ?? 20;

  const audit = await buildPipelineAuditForRun({
    walkForwardRunId: input.walkForwardRunId,
    auditLimit,
    generatedAt,
  });

  const existingSnapshots = await listPipelineAuditSnapshots({
    walkForwardRunId: input.walkForwardRunId,
    limit: historyLimit,
  });

  const baselineRecord =
    existingSnapshots.find((snapshot) => snapshot.evidenceHash !== audit.evidenceHash) ?? null;

  const regression = baselineRecord
    ? comparePipelineAudits(baselineRecord.snapshot, audit)
    : {
        comparable: false,
        regressed: false,
        events: [],
      };

  const snapshotRecord = input.persist
    ? await savePipelineAuditSnapshot({ snapshot: audit })
    : {
        id: -1,
        walkForwardRunId: input.walkForwardRunId,
        ativo: audit.scope.asset ?? "UNKNOWN",
        timeframe: audit.scope.timeframe as "1h" | "4h" | "1d",
        datasetHash: audit.scope.datasetHash ?? "",
        auditVersion: audit.version,
        state: audit.state,
        operationalQualityState: null,
        evidenceHash: audit.evidenceHash,
        createdAt: generatedAt,
        snapshot: audit,
      };

  const persistedSnapshots = input.persist
    ? await listPipelineAuditSnapshots({
        walkForwardRunId: input.walkForwardRunId,
        limit: historyLimit,
      })
    : existingSnapshots;

  const history = persistedSnapshots.map((snapshot) => ({
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    state: snapshot.state,
    evidenceHash: snapshot.evidenceHash,
    datasetHash: snapshot.datasetHash,
  }));

  return buildContinuousGovernanceOverview({
    generatedAt,
    audit,
    snapshot: {
      id: snapshotRecord.id,
      createdAt: snapshotRecord.createdAt,
      evidenceHash: snapshotRecord.evidenceHash,
      datasetHash: snapshotRecord.datasetHash,
      state: snapshotRecord.state,
    },
    baseline: baselineRecord
      ? {
          id: baselineRecord.id,
          createdAt: baselineRecord.createdAt,
          evidenceHash: baselineRecord.evidenceHash,
          datasetHash: baselineRecord.datasetHash,
          state: baselineRecord.state,
          snapshot: baselineRecord.snapshot,
        }
      : null,
    regression,
    history,
  });
}
