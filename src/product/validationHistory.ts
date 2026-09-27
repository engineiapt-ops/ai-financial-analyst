import type { Timeframe } from "../types.js";
import type { SystemValidationOverview, SystemValidationState } from "./systemValidation.js";

export const VALIDATION_HISTORY_VERSION = "validation-history.v1";

export interface ValidationHistorySnapshotRecord {
  id: number;
  generatedAt: Date;
  createdAt: Date;
  ativo: string;
  timeframe: Timeframe;
  fromRun: number | null;
  lookbackDays: number;
  state: SystemValidationState;
  readyCount: number;
  degradedCount: number;
  blockedCount: number;
  blockingFailures: number;
  evidenceHash: string;
  snapshot: SystemValidationOverview;
}

export interface ValidationHistoryItem {
  snapshotId: number;
  generatedAt: string;
  createdAt: string;
  state: SystemValidationState;
  evidenceHash: string;
  readyCount: number;
  degradedCount: number;
  blockedCount: number;
  blockingFailures: number;
  fromRun: number | null;
}

export interface ValidationTimelineEvent {
  snapshotId: number;
  at: string;
  kind:
    | "snapshot-recorded"
    | "state-change"
    | "blocking-failures-change"
    | "evidence-change";
  severity: "info" | "warning" | "critical";
  state: SystemValidationState;
  evidenceHash: string;
  message: string;
  previousState?: SystemValidationState;
  previousEvidenceHash?: string;
  previousBlockingFailures?: number;
}

export interface ValidationHistoryOverview {
  version: typeof VALIDATION_HISTORY_VERSION;
  generatedAt: string;
  scope: {
    asset: string;
    timeframe: Timeframe;
    fromRun: number | null;
  };
  count: number;
  current: ValidationHistoryItem | null;
  history: ValidationHistoryItem[];
  timeline: ValidationTimelineEvent[];
  evidenceHashes: string[];
  checks: {
    temporalOrderValid: boolean;
    evidenceHashesValid: boolean;
    scopeConsistent: boolean;
  };
  interpretation: {
    historyMeans: string;
    timelineMeans: string;
    notAnInvestmentVerdict: true;
  };
  notes: string[];
}

function toItem(snapshot: ValidationHistorySnapshotRecord): ValidationHistoryItem {
  return {
    snapshotId: snapshot.id,
    generatedAt: snapshot.generatedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    state: snapshot.state,
    evidenceHash: snapshot.evidenceHash,
    readyCount: snapshot.readyCount,
    degradedCount: snapshot.degradedCount,
    blockedCount: snapshot.blockedCount,
    blockingFailures: snapshot.blockingFailures,
    fromRun: snapshot.fromRun,
  };
}

function eventForSnapshot(
  snapshot: ValidationHistorySnapshotRecord,
  previous: ValidationHistorySnapshotRecord | undefined,
): ValidationTimelineEvent[] {
  const base: ValidationTimelineEvent = {
    snapshotId: snapshot.id,
    at: snapshot.createdAt.toISOString(),
    kind: "snapshot-recorded",
    severity: snapshot.state === "blocked" ? "critical" : snapshot.state === "degraded" ? "warning" : "info",
    state: snapshot.state,
    evidenceHash: snapshot.evidenceHash,
    message: `Validation snapshot recorded with state ${snapshot.state}.`,
  };

  if (!previous) return [base];

  const events: ValidationTimelineEvent[] = [base];

  if (previous.state !== snapshot.state) {
    events.push({
      ...base,
      kind: "state-change",
      severity: snapshot.state === "blocked" ? "critical" : snapshot.state === "degraded" ? "warning" : "info",
      message: `Validation state changed from ${previous.state} to ${snapshot.state}.`,
      previousState: previous.state,
    });
  }

  if (previous.blockingFailures !== snapshot.blockingFailures) {
    events.push({
      ...base,
      kind: "blocking-failures-change",
      severity: snapshot.blockingFailures > previous.blockingFailures ? "critical" : "info",
      message: `Blocking failures changed from ${previous.blockingFailures} to ${snapshot.blockingFailures}.`,
      previousBlockingFailures: previous.blockingFailures,
    });
  }

  if (previous.evidenceHash !== snapshot.evidenceHash) {
    events.push({
      ...base,
      kind: "evidence-change",
      severity: "info",
      message: "Validation evidence hash changed between consecutive snapshots.",
      previousEvidenceHash: previous.evidenceHash,
    });
  }

  return events;
}

export function buildValidationHistoryOverview(input: {
  generatedAt: Date;
  asset: string;
  timeframe: Timeframe;
  fromRun?: number;
  snapshots: ValidationHistorySnapshotRecord[];
}): ValidationHistoryOverview {
  const chronological = [...input.snapshots].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );

  const temporalOrderValid = chronological.every(
    (item, index) =>
      index === 0 ||
      item.createdAt.getTime() >= chronological[index - 1].createdAt.getTime(),
  );

  const evidenceHashesValid = chronological.every(
    (item) => /^[0-9a-f]{64}$/.test(item.evidenceHash),
  );

  const scopeConsistent = chronological.every(
    (item) =>
      item.ativo.toUpperCase() === input.asset.toUpperCase() &&
      item.timeframe === input.timeframe &&
      (input.fromRun === undefined || item.fromRun === input.fromRun),
  );

  const timeline = chronological.flatMap((item, index) =>
    eventForSnapshot(item, chronological[index - 1]),
  );
  const history = [...chronological].reverse().map(toItem);
  const current = history[0] ?? null;

  return {
    version: VALIDATION_HISTORY_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    scope: {
      asset: input.asset.toUpperCase(),
      timeframe: input.timeframe,
      fromRun: input.fromRun ?? null,
    },
    count: history.length,
    current,
    history,
    timeline: timeline.reverse(),
    evidenceHashes: history.map((item) => item.evidenceHash),
    checks: {
      temporalOrderValid,
      evidenceHashesValid,
      scopeConsistent,
    },
    interpretation: {
      historyMeans:
        "Persisted validation snapshots provide an immutable operational record of system state and evidence over time.",
      timelineMeans:
        "Timeline events summarize state, blocking-failure and evidence-hash changes between consecutive persisted validation snapshots.",
      notAnInvestmentVerdict: true,
    },
    notes: [
      "History records operational validation evidence only; it is not a performance or investment verdict.",
      "Snapshots are immutable and keyed by their deterministic validation evidence hash.",
      "The timeline does not rank strategies, alter thresholds, change sizing or authorize execution.",
    ],
  };
}
