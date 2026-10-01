import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { DecisionResult, Kline, Timeframe } from "../types.js";
import type { ResearchSnapshot } from "../research/snapshot.js";
import type { CalibrationObservation } from "../evaluation/calibration.js";
import type { OosValidationGate } from "../evaluation/oosValidationGate.js";
import type { OosValidationReport } from "../evaluation/oosValidationReport.js";
import type { OosRobustnessReport } from "../evaluation/oosRobustness.js";
import type { PipelineAuditOverview } from "../product/pipelineAudit.js";
import type { OutcomeSettlementAuditPayload } from "../evaluation/outcomeSettlementAudit.js";
import type { SystemValidationOverview, SystemValidationState } from "../product/systemValidation.js";

export interface RepositoryPool {
  query<T extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<PoolClient>;
}

export interface BacktestRunInput {
  engine: "both" | "baseline" | "jev";
  mode: "dev" | "oos";
  ativo: string;
  timeframe: Timeframe;
  periodoInicio: Date;
  periodoFim: Date;
  oosStartRatio?: number | null;
  calibrationEnd?: Date | null;
  validationStart?: Date | null;
  evaluationPolicyVersion?: string | null;
  thresholdsCongeladosEm?: Date | null;
  candlesTotal?: number | null;
  datasetHash?: string | null;
  executionModelVersion?: string | null;
  targetPct?: number | null;
  stopPct?: number | null;
  lookaheadCandles?: number | null;
  slippagePct?: number | null;
  feePct?: number | null;
}

export interface BacktestRun {
  id: number;
  engine: "both" | "baseline" | "jev";
  mode: "dev" | "oos";
  ativo: string;
  timeframe: Timeframe;
  periodoInicio: Date;
  periodoFim: Date;
  oosStartRatio: number | null;
  calibrationEnd: Date | null;
  validationStart: Date | null;
  evaluationPolicyVersion: string | null;
  thresholdsCongeladosEm: Date | null;
  candlesTotal: number | null;
  datasetHash: string | null;
  executionModelVersion: string | null;
  targetPct: number | null;
  stopPct: number | null;
  lookaheadCandles: number | null;
  slippagePct: number | null;
  feePct: number | null;
  criadoEm: Date;
}

export interface SaveSignalInput {
  backtestRunId?: number | null;
  ativo: string;
  timeframe: Timeframe;
  decision: DecisionResult;
  entrada?: number | null;
  stop?: number | null;
  alvo?: number | null;
}

export interface SaveTradeInput {
  signalId: number;
  entryPrice: number;
  exitPrice?: number | null;
  outcome: "win" | "loss" | "open";
  profitPercent: number;
  drawdown?: number | null;
  grossProfitPercent?: number | null;
  feePercent?: number | null;
  slippagePercent?: number | null;
  candlesHeld?: number | null;
  executionModelVersion?: string | null;
  exitReason?: "target" | "stop" | "end" | null;
  maxFavorableExcursionPercent?: number | null;
  maxAdverseExcursionPercent?: number | null;
  openedAt?: Date;
  closedAt?: Date | null;
}

export interface ResearchSnapshotRecord {
  snapshotId: string;
  schemaVersion: string;
  contentHash: string;
  signalId: number;
  decisionLogId: number | null;
  ativo: string;
  timeframe: Timeframe;
  dataAsOf: Date;
  createdAt: Date;
  snapshot: ResearchSnapshot;
}

export interface OosValidationGateAuditRecord {
  id: number;
  backtestRunId: number;
  walkForwardRunId: number | null;
  ativo: string;
  timeframe: Timeframe;
  estrategia: "baseline" | "baseline_risk" | "jev";
  gateVersion: string;
  status: "ready" | "blocked";
  validationFrom: Date;
  validationTo: Date;
  evidenceHash: string;
  createdAt: Date;
  gate: OosValidationGate;
  evidence: OosValidationGateAuditEvidence | null;
}

export interface OosValidationGateAuditEvidence {
  validationReport: OosValidationReport;
  robustnessReport: OosRobustnessReport;
}

export interface SaveOosValidationGateAuditInput {
  gate: OosValidationGate;
  evidence: OosValidationGateAuditEvidence;
}

export interface OosValidationGateAuditFilters {
  backtestRunId?: number | null;
  walkForwardRunId?: number | null;
  ativo?: string | null;
  timeframe?: Timeframe | null;
  strategy?: "baseline" | "baseline_risk" | "jev" | null;
  limit?: number;
}

export interface ResearchSnapshotFilters {
  ativo?: string | null;
  timeframe?: Timeframe | null;
  limit?: number;
}

export interface SaveResearchSnapshotInput {
  snapshot: ResearchSnapshot;
  decisionLogId?: number | null;
}

export interface PipelineAuditSnapshotRecord {
  id: number;
  walkForwardRunId: number;
  ativo: string;
  timeframe: Timeframe;
  datasetHash: string;
  auditVersion: string;
  state: PipelineAuditOverview["state"];
  operationalQualityState: PipelineAuditOverview["state"] | null;
  evidenceHash: string;
  createdAt: Date;
  snapshot: PipelineAuditOverview;
}

export interface SavePipelineAuditSnapshotInput {
  snapshot: PipelineAuditOverview;
}

export interface PipelineAuditSnapshotFilters {
  walkForwardRunId?: number | null;
  ativo?: string | null;
  timeframe?: Timeframe | null;
  limit?: number;
}

export interface SystemValidationSnapshotRecord {
  id: number;
  ativo: string;
  timeframe: Timeframe;
  fromRun: number | null;
  lookbackDays: number;
  validationVersion: string;
  state: SystemValidationState;
  readyCount: number;
  degradedCount: number;
  blockedCount: number;
  blockingFailures: number;
  evidenceHash: string;
  generatedAt: Date;
  createdAt: Date;
  snapshot: SystemValidationOverview;
}

export interface SaveSystemValidationSnapshotInput {
  snapshot: SystemValidationOverview;
}

export interface SystemValidationSnapshotFilters {
  ativo?: string | null;
  timeframe?: Timeframe | null;
  fromRun?: number | null;
  limit?: number;
}

export interface DecisionLogRecord {
  id: number;
  ativo: string;
  timeframe: Timeframe;
  decisionAt: Date;
  dataAsOf: Date;
  origem: DecisionResult["origem"];
  recomendacao: DecisionResult["recomendacao"];
  jevModelVersion: string | null;
  jevChoice: DecisionResult["jevChoice"] | null;
  jevProbs: Record<string, number> | null;
  confidence: number | null;
  qualityScore: number | null;
  riscoElevado: boolean | null;
  tamanhoPosicaoPct: number;
  observacao: string | null;
  referencePrice: number;
  outcomeStatus: "pending" | "settled" | "not_applicable";
  outcomeDirection: "up" | "down" | "flat" | null;
  forwardReturnPercent: number | null;
  tradeProfitPercent: number | null;
  exitReason: "target" | "stop" | "end" | null;
  evaluatedAt: Date | null;
}

export interface DecisionKpiFilters {
  ativo?: string | null;
  timeframe?: Timeframe | null;
  origem?: DecisionResult["origem"] | null;
  recomendacao?: DecisionResult["recomendacao"] | null;
  riskRegime?: string | null;
  from?: Date | null;
  to?: Date | null;
}

export interface DecisionKpiSummary {
  totalDecisions: number;
  settledDecisions: number;
  pendingDecisions: number;
  notApplicableDecisions: number;
  profitableDecisions: number;
  losingDecisions: number;
  flatDecisions: number;
  winRate: number | null;
  avgForwardReturnPercent: number | null;
  avgTradeProfitPercent: number | null;
  totalTradeProfitPercent: number;
  avgConfidence: number | null;
  avgQualityScore: number | null;
  riskElevatedDecisions: number;
  buyDecisions: number;
  sellDecisions: number;
  waitDecisions: number;
}

export interface DecisionKpiBreakdown extends DecisionKpiSummary {
  origem: string;
  ativo: string;
  timeframe: Timeframe;
  recomendacao: DecisionResult["recomendacao"];
  riskRegime: string;
}

export interface DecisionKpis {
  filters: DecisionKpiFilters;
  summary: DecisionKpiSummary;
  breakdown: DecisionKpiBreakdown[];
}

export interface PendingDecisionLogFilters {
  ativo?: string | null;
  timeframe?: Timeframe | null;
  limit?: number;
}

export interface OutcomeSettlementAuditRecord extends OutcomeSettlementAuditPayload {
  id: number;
  createdAt: Date;
}

export interface OutcomeSettlementAuditFilters {
  decisionLogId?: number | null;
  ativo?: string | null;
  timeframe?: Timeframe | null;
  from?: Date | null;
  to?: Date | null;
  limit?: number;
}

export interface OutcomeSettlementAuditSummary {
  version: "outcome-settlement-audit.v1";
  filters: {
    ativo: string | null;
    timeframe: Timeframe | null;
    from: Date | null;
    to: Date | null;
  };
  finalizedDecisions: number;
  settledDecisions: number;
  notApplicableDecisions: number;
  pendingDecisions: number;
  auditedDecisions: number;
  coveragePct: number | null;
  latestEvaluatedAt: Date | null;
}

export interface DecisionLogInput {
  backtestRunId?: number | null;
  ativo: string;
  timeframe: Timeframe;
  decisionAt: Date;
  dataAsOf: Date;
  decision: DecisionResult;
  referencePrice: number;
  targetPct?: number | null;
  stopPct?: number | null;
  lookaheadCandles?: number | null;
  executionModelVersion?: string | null;
}

export interface DecisionLogOutcome {
  outcomeStatus: "settled" | "not_applicable";
  outcomeDirection?: "up" | "down" | "flat" | null;
  forwardReturnPercent?: number | null;
  tradeProfitPercent?: number | null;
  exitReason?: "target" | "stop" | "end" | null;
  evaluatedAt?: Date | null;
}

export interface BenchmarkRunInput {
  sourceRunId?: number | null;
  ativo: string;
  timeframe: Timeframe;
  periodoInicio: Date;
  periodoFim: Date;
  oosStartRatio?: number | null;
  candlesTotal?: number | null;
  datasetHash?: string | null;
  executionModelVersion?: string | null;
  targetPct?: number | null;
  stopPct?: number | null;
  lookaheadCandles?: number | null;
  slippagePct?: number | null;
  feePct?: number | null;
}

export interface BenchmarkResultInput {
  benchmarkRunId: number;
  estrategia: "baseline" | "baseline_risk" | "buyhold" | "jev";
  status: "ok" | "unavailable" | "error";
  totalTrades?: number;
  closedTrades?: number;
  openTrades?: number;
  winRate?: number | null;
  profitFactor?: number | null;
  totalProfitPercent?: number;
  avgProfitPercent?: number;
  expectancyPercent?: number;
  maxDrawdownPercent?: number;
  grossTotalProfitPercent?: number;
  totalFeePercent?: number;
  totalSlippagePercent?: number;
  avgCandlesHeld?: number | null;
  notas?: string | null;
}

export interface WalkForwardRunInput {
  ativo: string;
  timeframe: Timeframe;
  datasetStart: Date;
  datasetEnd: Date;
  candlesTotal: number;
  datasetHash: string;
  initialTrainCandles: number;
  testCandles: number;
  stepCandles: number;
  lookaheadCandles: number;
  executionModelVersion: string;
  targetPct: number;
  stopPct: number;
  slippagePct: number;
  feePct: number;
  thresholdFrozenAt?: Date | null;
}

export interface WalkForwardFoldInput {
  walkForwardRunId: number;
  foldNumber: number;
  trainStart: Date;
  trainEnd: Date;
  testStart: Date;
  testEnd: Date;
  estrategia: "baseline" | "baseline_risk" | "buyhold" | "jev";
  status: "ok" | "unavailable" | "error";
  testSignals?: number;
  totalTrades?: number;
  closedTrades?: number;
  openTrades?: number;
  winRate?: number | null;
  profitFactor?: number | null;
  totalProfitPercent?: number;
  avgProfitPercent?: number;
  expectancyPercent?: number;
  maxDrawdownPercent?: number;
  grossTotalProfitPercent?: number;
  totalFeePercent?: number;
  totalSlippagePercent?: number;
  avgCandlesHeld?: number | null;
  notas?: string | null;
}

export interface WalkForwardPortfolioRunSummaryInput {
  walkForwardRunId: number;
  strategy: "baseline" | "baseline_risk";
  initialCapital: number;
  positionSizePct: number;
  maxGrossExposurePct: number;
  portfolioModelVersion: string;
  finalEquity: number;
  totalReturnPct: number;
  cagrPct?: number | null;
  maxDrawdownPct: number;
  sharpe?: number | null;
  sortino?: number | null;
  totalSignals: number;
  executedTrades: number;
  closedTrades: number;
  rejectedTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalRealizedPnl: number;
  totalFees: number;
  totalSlippage: number;
  maxOpenPositions: number;
  maxGrossExposure: number;
  riskGateBlocks: number;
}

export interface WalkForwardPortfolioFoldInput {
  walkForwardPortfolioRunId: number;
  walkForwardRunId: number;
  foldNumber: number;
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpe?: number | null;
  sortino?: number | null;
  totalSignals: number;
  executedTrades: number;
  closedTrades: number;
  rejectedTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalRealizedPnl: number;
  totalFees: number;
  totalSlippage: number;
  maxOpenPositions: number;
  maxGrossExposure: number;
  riskGateBlocks: number;
}

export interface WalkForwardPortfolioEquityInput {
  walkForwardPortfolioRunId: number;
  foldNumber: number;
  asOf: Date;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
  grossExposure: number;
  openPositions: number;
  drawdownPct: number;
}

export interface PortfolioRunInput {
  sourceBacktestRunId: number;
  ativo: string;
  timeframe: Timeframe;
  initialCapital: number;
  positionSizePct: number;
  maxGrossExposurePct: number;
  portfolioModelVersion: string;
  datasetHash: string;
}

export interface PortfolioRunSummary {
  finalEquity: number;
  totalReturnPct: number;
  cagrPct?: number | null;
  maxDrawdownPct: number;
  sharpe?: number | null;
  sortino?: number | null;
  totalTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  rejectedTrades: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalFees: number;
  totalSlippage: number;
}

export interface PortfolioPositionInput {
  portfolioRunId: number;
  paperTradeId: number;
  side: "BUY" | "SELL";
  allocatedNotional: number;
  entryPrice: number;
  exitPrice?: number | null;
  openedAt: Date;
  closedAt?: Date | null;
  status: "closed" | "liquidated_end" | "rejected";
  netPnl?: number;
  grossPnl?: number;
  fees?: number;
  slippage?: number;
  returnPct?: number;
  rejectionReason?: string | null;
}

export interface PortfolioEquityPointInput {
  portfolioRunId: number;
  asOf: Date;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
  grossExposure: number;
  openPositions: number;
  drawdownPct: number;
}

export interface PortfolioSourceTrade {
  paperTradeId: number;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number | null;
  outcome: "win" | "loss" | "open";
  profitPercent: number;
  grossProfitPercent: number | null;
  feePercent: number | null;
  slippagePercent: number | null;
  openedAt: Date;
  closedAt: Date | null;
}

export interface MetricsByOrigem {
  origem: string;
  total: number;
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  win_rate: number;
  profit_factor: number | null;
  total_profit_percent: number;
  avg_profit_percent: number;
  expectancy_percent: number;
  max_drawdown_percent: number;
  gross_total_profit_percent: number;
  total_fee_percent: number;
  total_slippage_percent: number;
  avg_candles_held: number;
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for repository operations");
  }
  return value;
}

let defaultPool: Pool | null = null;

function getDefaultPool(): Pool {
  if (!defaultPool) {
    defaultPool = new pg.Pool({ connectionString: requireDatabaseUrl() });
  }
  return defaultPool;
}

function asFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
  return value;
}


function timeframeDurationMs(timeframe: Timeframe): number {
  const hours = timeframe === "1h" ? 1 : timeframe === "4h" ? 4 : 24;
  return hours * 60 * 60 * 1000;
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error("limit must be an integer between 1 and 5000");
  }
  return limit;
}

export function createRepository(db: RepositoryPool) {
  return {
    async createBacktestRun(input: BacktestRunInput): Promise<number> {
      if (input.oosStartRatio !== null && input.oosStartRatio !== undefined &&
          (!Number.isFinite(input.oosStartRatio) || input.oosStartRatio < 0 || input.oosStartRatio > 1)) {
        throw new Error("oosStartRatio must be between 0 and 1");
      }
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO backtest_runs
          (engine, mode, ativo, timeframe, periodo_inicio, periodo_fim, oos_start_ratio,
           calibration_end, validation_start, evaluation_policy_version, thresholds_congelados_em,
           candles_total, dataset_hash, execution_model_version, target_pct, stop_pct,
           lookahead_candles, slippage_pct, fee_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [
          input.engine,
          input.mode,
          input.ativo,
          input.timeframe,
          input.periodoInicio,
          input.periodoFim,
          input.oosStartRatio ?? null,
          input.calibrationEnd ?? null,
          input.validationStart ?? null,
          input.evaluationPolicyVersion ?? null,
          input.thresholdsCongeladosEm ?? null,
          input.candlesTotal ?? null,
          input.datasetHash ?? null,
          input.executionModelVersion ?? null,
          input.targetPct ?? null,
          input.stopPct ?? null,
          input.lookaheadCandles ?? null,
          input.slippagePct ?? null,
          input.feePct ?? null,
        ],
      );
      const id = Number(rows[0]?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a valid backtest run id");
      return id;
    },

    async getBacktestRun(id: number): Promise<BacktestRun | null> {
      const { rows } = await db.query<{
        id: string | number;
        engine: "both" | "baseline" | "jev";
        mode: "dev" | "oos";
        ativo: string;
        timeframe: Timeframe;
        periodo_inicio: Date;
        periodo_fim: Date;
        oos_start_ratio: string | number | null;
        calibration_end: Date | null;
        validation_start: Date | null;
        evaluation_policy_version: string | null;
        thresholds_congelados_em: Date | null;
        candles_total: number | null;
        dataset_hash: string | null;
        execution_model_version: string | null;
        target_pct: string | number | null;
        stop_pct: string | number | null;
        lookahead_candles: number | null;
        slippage_pct: string | number | null;
        fee_pct: string | number | null;
        criado_em: Date;
      }>(
        `SELECT id, engine, mode, ativo, timeframe, periodo_inicio, periodo_fim,
                oos_start_ratio, calibration_end, validation_start, evaluation_policy_version,
                thresholds_congelados_em, candles_total, dataset_hash,
                execution_model_version, target_pct, stop_pct, lookahead_candles, slippage_pct, fee_pct, criado_em
         FROM backtest_runs
         WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        engine: row.engine,
        mode: row.mode,
        ativo: row.ativo,
        timeframe: row.timeframe,
        periodoInicio: new Date(row.periodo_inicio),
        periodoFim: new Date(row.periodo_fim),
        oosStartRatio: row.oos_start_ratio !== null ? Number(row.oos_start_ratio) : null,
        calibrationEnd: row.calibration_end ? new Date(row.calibration_end) : null,
        validationStart: row.validation_start ? new Date(row.validation_start) : null,
        evaluationPolicyVersion: row.evaluation_policy_version ?? null,
        thresholdsCongeladosEm: row.thresholds_congelados_em ? new Date(row.thresholds_congelados_em) : null,
        candlesTotal: row.candles_total !== null ? Number(row.candles_total) : null,
        datasetHash: row.dataset_hash ?? null,
        executionModelVersion: row.execution_model_version ?? null,
        targetPct: row.target_pct !== null ? Number(row.target_pct) : null,
        stopPct: row.stop_pct !== null ? Number(row.stop_pct) : null,
        lookaheadCandles: row.lookahead_candles !== null ? Number(row.lookahead_candles) : null,
        slippagePct: row.slippage_pct !== null ? Number(row.slippage_pct) : null,
        feePct: row.fee_pct !== null ? Number(row.fee_pct) : null,
        criadoEm: new Date(row.criado_em),
      };
    },

    async saveSignal(input: SaveSignalInput): Promise<number> {
      const { ativo, timeframe, decision } = input;
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO signals
          (backtest_run_id, ativo, timeframe, entrada, stop, alvo, origem, jev_choice, jev_probs,
           jev_model_version, quality_score, risco_elevado, recomendacao,
           tamanho_posicao_pct, observacao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          input.backtestRunId ?? null,
          ativo,
          timeframe,
          input.entrada ?? null,
          input.stop ?? null,
          input.alvo ?? null,
          decision.origem,
          decision.jevChoice ?? null,
          decision.jevProbs ? JSON.stringify(decision.jevProbs) : null,
          decision.jevModelVersion ?? null,
          decision.qualityScore ?? null,
          decision.riscoElevado ?? null,
          decision.recomendacao,
          decision.tamanhoPosicaoPct,
          decision.observacao ?? null,
        ],
      );
      const id = Number(rows[0]?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a valid signal id");
      return id;
    },

    async saveOosValidationGateAudit(
      input: SaveOosValidationGateAuditInput,
    ): Promise<OosValidationGateAuditRecord> {
      const gate = input.gate;
      if (!/^[0-9a-f]{64}$/.test(gate.evidenceHash)) {
        throw new Error("evidenceHash must be a 64-character lowercase SHA-256 hex string");
      }

      const { rows } = await db.query<{
        id: number;
        backtest_run_id: number;
        walk_forward_run_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        estrategia: "baseline" | "baseline_risk" | "jev";
        gate_version: string;
        status: "ready" | "blocked";
        validation_from: Date;
        validation_to: Date;
        evidence_hash: string;
        created_at: Date;
        gate: OosValidationGate;
        evidence: OosValidationGateAuditEvidence | null;
      }>(
        `INSERT INTO oos_validation_gate_audits
          (backtest_run_id, walk_forward_run_id, ativo, timeframe, estrategia,
           gate_version, status, validation_from, validation_to, evidence_hash, gate, evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
         ON CONFLICT (backtest_run_id, walk_forward_run_id, estrategia, evidence_hash)
         DO NOTHING
         RETURNING id, backtest_run_id, walk_forward_run_id, ativo, timeframe,
                   estrategia, gate_version, status, validation_from, validation_to,
                   evidence_hash, created_at, gate, evidence`,
        [
          gate.scope.backtestRunId,
          gate.scope.walkForwardRunId,
          gate.scope.ativo,
          gate.scope.timeframe,
          gate.strategy,
          gate.gateVersion,
          gate.status,
          new Date(gate.scope.validationFrom),
          new Date(gate.scope.validationTo),
          gate.evidenceHash,
          JSON.stringify(gate),
          input.evidence ? JSON.stringify(input.evidence) : null,
        ],
      );

      const row = rows[0];
      if (row) {
        return {
          id: Number(row.id),
          backtestRunId: Number(row.backtest_run_id),
          walkForwardRunId:
            row.walk_forward_run_id === null ? null : Number(row.walk_forward_run_id),
          ativo: row.ativo,
          timeframe: row.timeframe,
          estrategia: row.estrategia,
          gateVersion: row.gate_version,
          status: row.status,
          validationFrom: new Date(row.validation_from),
          validationTo: new Date(row.validation_to),
          evidenceHash: row.evidence_hash,
          createdAt: new Date(row.created_at),
          gate: row.gate,
          evidence: row.evidence ?? null,
        };
      }

      const existing = await db.query<typeof rows[number]>(
        `SELECT id, backtest_run_id, walk_forward_run_id, ativo, timeframe,
                estrategia, gate_version, status, validation_from, validation_to,
                evidence_hash, created_at, gate, evidence
         FROM oos_validation_gate_audits
         WHERE backtest_run_id = $1
           AND walk_forward_run_id IS NOT DISTINCT FROM $2
           AND estrategia = $3
           AND evidence_hash = $4`,
        [
          gate.scope.backtestRunId,
          gate.scope.walkForwardRunId,
          gate.strategy,
          gate.evidenceHash,
        ],
      );

      const existingRow = existing.rows[0];
      if (!existingRow) {
        throw new Error("OOS validation gate audit could not be persisted");
      }

      return {
        id: Number(existingRow.id),
        backtestRunId: Number(existingRow.backtest_run_id),
        walkForwardRunId:
          existingRow.walk_forward_run_id === null
            ? null
            : Number(existingRow.walk_forward_run_id),
        ativo: existingRow.ativo,
        timeframe: existingRow.timeframe,
        estrategia: existingRow.estrategia,
        gateVersion: existingRow.gate_version,
        status: existingRow.status,
        validationFrom: new Date(existingRow.validation_from),
        validationTo: new Date(existingRow.validation_to),
        evidenceHash: existingRow.evidence_hash,
        createdAt: new Date(existingRow.created_at),
        gate: existingRow.gate,
        evidence: existingRow.evidence ?? null,
      };
    },

    async getOosValidationGateAudit(
      id: number,
    ): Promise<OosValidationGateAuditRecord | null> {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("audit id must be a positive integer");
      }

      const { rows } = await db.query<{
        id: number;
        backtest_run_id: number;
        walk_forward_run_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        estrategia: "baseline" | "baseline_risk" | "jev";
        gate_version: string;
        status: "ready" | "blocked";
        validation_from: Date;
        validation_to: Date;
        evidence_hash: string;
        created_at: Date;
        gate: OosValidationGate;
        evidence: OosValidationGateAuditEvidence | null;
      }>(
        `SELECT id, backtest_run_id, walk_forward_run_id, ativo, timeframe,
                estrategia, gate_version, status, validation_from, validation_to,
                evidence_hash, created_at, gate, evidence
         FROM oos_validation_gate_audits
         WHERE id = $1`,
        [id],
      );

      const row = rows[0];
      if (!row) return null;

      return {
        id: Number(row.id),
        backtestRunId: Number(row.backtest_run_id),
        walkForwardRunId:
          row.walk_forward_run_id === null ? null : Number(row.walk_forward_run_id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        estrategia: row.estrategia,
        gateVersion: row.gate_version,
        status: row.status,
        validationFrom: new Date(row.validation_from),
        validationTo: new Date(row.validation_to),
        evidenceHash: row.evidence_hash,
        createdAt: new Date(row.created_at),
        gate: row.gate,
        evidence: row.evidence ?? null,
      };
    },

    async listOosValidationGateAudits(
      filters: OosValidationGateAuditFilters = {},
    ): Promise<OosValidationGateAuditRecord[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", String(values.length)));
      };

      if (filters.backtestRunId !== null && filters.backtestRunId !== undefined) {
        add("backtest_run_id = ?", filters.backtestRunId);
      }
      if (filters.walkForwardRunId !== null && filters.walkForwardRunId !== undefined) {
        add("walk_forward_run_id = ?", filters.walkForwardRunId);
      }
      if (filters.ativo) {
        add("ativo = ?", filters.ativo.trim().toUpperCase());
      }
      if (filters.timeframe) {
        add("timeframe = ?", filters.timeframe);
      }
      if (filters.strategy) {
        add("estrategia = ?", filters.strategy);
      }

      const limit = filters.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("audit history limit must be an integer between 1 and 100");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await db.query<{
        id: number;
        backtest_run_id: number;
        walk_forward_run_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        estrategia: "baseline" | "baseline_risk" | "jev";
        gate_version: string;
        status: "ready" | "blocked";
        validation_from: Date;
        validation_to: Date;
        evidence_hash: string;
        created_at: Date;
        gate: OosValidationGate;
      }>(
        `SELECT id, backtest_run_id, walk_forward_run_id, ativo, timeframe,
                estrategia, gate_version, status, validation_from, validation_to,
                evidence_hash, created_at, gate
         FROM oos_validation_gate_audits
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limit}`,
        values,
      );

      return rows.map((row) => ({
        id: Number(row.id),
        backtestRunId: Number(row.backtest_run_id),
        walkForwardRunId:
          row.walk_forward_run_id === null ? null : Number(row.walk_forward_run_id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        estrategia: row.estrategia,
        gateVersion: row.gate_version,
        status: row.status,
        validationFrom: new Date(row.validation_from),
        validationTo: new Date(row.validation_to),
        evidenceHash: row.evidence_hash,
        createdAt: new Date(row.created_at),
        gate: row.gate,
        evidence: null,
      }));
    },

    async savePipelineAuditSnapshot(
      input: SavePipelineAuditSnapshotInput,
    ): Promise<PipelineAuditSnapshotRecord> {
      const snapshot = input.snapshot;
      const resolvedWalkForwardRunId = snapshot.scope.walkForwardRunId;
      const ativo = snapshot.scope.asset;
      const timeframe = snapshot.scope.timeframe;
      const datasetHash = snapshot.scope.datasetHash;

      if (
        typeof resolvedWalkForwardRunId !== "number" ||
        !Number.isInteger(resolvedWalkForwardRunId) ||
        resolvedWalkForwardRunId <= 0
      ) {
        throw new Error("pipeline audit snapshot requires a positive walk-forward run id");
      }
      if (!ativo || !timeframe || !datasetHash) {
        throw new Error("pipeline audit snapshot requires asset, timeframe and dataset hash");
      }
      if (!/^[0-9a-f]{64}$/.test(datasetHash)) {
        throw new Error("datasetHash must be a 64-character lowercase SHA-256 hex string");
      }
      if (!/^[0-9a-f]{64}$/.test(snapshot.evidenceHash)) {
        throw new Error("evidenceHash must be a 64-character lowercase SHA-256 hex string");
      }

      const walkForwardRunId = resolvedWalkForwardRunId;

      const rowResult = await db.query<{
        id: number;
        walk_forward_run_id: number;
        ativo: string;
        timeframe: Timeframe;
        dataset_hash: string;
        audit_version: string;
        state: PipelineAuditOverview["state"];
        operational_quality_state: PipelineAuditOverview["state"] | null;
        evidence_hash: string;
        created_at: Date;
        snapshot: PipelineAuditOverview;
      }>(
        `INSERT INTO pipeline_audit_snapshots
          (walk_forward_run_id, ativo, timeframe, dataset_hash, audit_version,
           state, operational_quality_state, evidence_hash, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         ON CONFLICT (walk_forward_run_id, evidence_hash)
         DO NOTHING
         RETURNING id, walk_forward_run_id, ativo, timeframe, dataset_hash,
                   audit_version, state, operational_quality_state, evidence_hash,
                   created_at, snapshot`,
        [
          walkForwardRunId,
          ativo,
          timeframe,
          datasetHash,
          snapshot.version,
          snapshot.state,
          snapshot.traceability.product.operationalQualityState,
          snapshot.evidenceHash,
          JSON.stringify(snapshot),
        ],
      );

      const row = rowResult.rows[0];
      if (row) {
        return {
          id: Number(row.id),
          walkForwardRunId: Number(row.walk_forward_run_id),
          ativo: row.ativo,
          timeframe: row.timeframe,
          datasetHash: row.dataset_hash,
          auditVersion: row.audit_version,
          state: row.state,
          operationalQualityState: row.operational_quality_state,
          evidenceHash: row.evidence_hash,
          createdAt: new Date(row.created_at),
          snapshot: row.snapshot,
        };
      }

      const existing = await db.query<{
        id: number;
        walk_forward_run_id: number;
        ativo: string;
        timeframe: Timeframe;
        dataset_hash: string;
        audit_version: string;
        state: PipelineAuditOverview["state"];
        operational_quality_state: PipelineAuditOverview["state"] | null;
        evidence_hash: string;
        created_at: Date;
        snapshot: PipelineAuditOverview;
      }>(
        `SELECT id, walk_forward_run_id, ativo, timeframe, dataset_hash,
                audit_version, state, operational_quality_state, evidence_hash,
                created_at, snapshot
         FROM pipeline_audit_snapshots
         WHERE walk_forward_run_id = $1
           AND evidence_hash = $2`,
        [walkForwardRunId, snapshot.evidenceHash],
      );

      const existingRow = existing.rows[0];
      if (!existingRow) {
        throw new Error("Pipeline audit snapshot could not be persisted");
      }

      return {
        id: Number(existingRow.id),
        walkForwardRunId: Number(existingRow.walk_forward_run_id),
        ativo: existingRow.ativo,
        timeframe: existingRow.timeframe,
        datasetHash: existingRow.dataset_hash,
        auditVersion: existingRow.audit_version,
        state: existingRow.state,
        operationalQualityState: existingRow.operational_quality_state,
        evidenceHash: existingRow.evidence_hash,
        createdAt: new Date(existingRow.created_at),
        snapshot: existingRow.snapshot,
      };
    },

    async getPipelineAuditSnapshot(
      id: number,
    ): Promise<PipelineAuditSnapshotRecord | null> {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("pipeline audit snapshot id must be a positive integer");
      }

      const { rows } = await db.query<{
        id: number;
        walk_forward_run_id: number;
        ativo: string;
        timeframe: Timeframe;
        dataset_hash: string;
        audit_version: string;
        state: PipelineAuditOverview["state"];
        operational_quality_state: PipelineAuditOverview["state"] | null;
        evidence_hash: string;
        created_at: Date;
        snapshot: PipelineAuditOverview;
      }>(
        `SELECT id, walk_forward_run_id, ativo, timeframe, dataset_hash,
                audit_version, state, operational_quality_state, evidence_hash,
                created_at, snapshot
         FROM pipeline_audit_snapshots
         WHERE id = $1`,
        [id],
      );

      const row = rows[0];
      if (!row) return null;

      return {
        id: Number(row.id),
        walkForwardRunId: Number(row.walk_forward_run_id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        datasetHash: row.dataset_hash,
        auditVersion: row.audit_version,
        state: row.state,
        operationalQualityState: row.operational_quality_state,
        evidenceHash: row.evidence_hash,
        createdAt: new Date(row.created_at),
        snapshot: row.snapshot,
      };
    },

    async listPipelineAuditSnapshots(
      filters: PipelineAuditSnapshotFilters = {},
    ): Promise<PipelineAuditSnapshotRecord[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", String(values.length)));
      };

      if (filters.walkForwardRunId !== null && filters.walkForwardRunId !== undefined) {
        add("walk_forward_run_id = ?", filters.walkForwardRunId);
      }
      if (filters.ativo) {
        add("ativo = ?", filters.ativo.trim().toUpperCase());
      }
      if (filters.timeframe) {
        add("timeframe = ?", filters.timeframe);
      }

      const limit = filters.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("pipeline audit snapshot history limit must be an integer between 1 and 100");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await db.query<{
        id: number;
        walk_forward_run_id: number;
        ativo: string;
        timeframe: Timeframe;
        dataset_hash: string;
        audit_version: string;
        state: PipelineAuditOverview["state"];
        operational_quality_state: PipelineAuditOverview["state"] | null;
        evidence_hash: string;
        created_at: Date;
        snapshot: PipelineAuditOverview;
      }>(
        `SELECT id, walk_forward_run_id, ativo, timeframe, dataset_hash,
                audit_version, state, operational_quality_state, evidence_hash,
                created_at, snapshot
         FROM pipeline_audit_snapshots
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limit}`,
        values,
      );

      return rows.map((row) => ({
        id: Number(row.id),
        walkForwardRunId: Number(row.walk_forward_run_id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        datasetHash: row.dataset_hash,
        auditVersion: row.audit_version,
        state: row.state,
        operationalQualityState: row.operational_quality_state,
        evidenceHash: row.evidence_hash,
        createdAt: new Date(row.created_at),
        snapshot: row.snapshot,
      }));
    },

    async saveSystemValidationSnapshot(
      input: SaveSystemValidationSnapshotInput,
    ): Promise<SystemValidationSnapshotRecord> {
      const snapshot = input.snapshot;
      if (!/^[0-9a-f]{64}$/.test(snapshot.evidenceHash)) {
        throw new Error("system validation evidenceHash must be a 64-character lowercase SHA-256 hex string");
      }
      if (snapshot.version !== "system-validation.v1") {
        throw new Error("unsupported system validation contract version");
      }

      const { rows } = await db.query<{
        id: number;
        ativo: string;
        timeframe: Timeframe;
        from_run: number | null;
        lookback_days: number;
        validation_version: string;
        state: SystemValidationState;
        ready_count: number;
        degraded_count: number;
        blocked_count: number;
        blocking_failures: number;
        evidence_hash: string;
        generated_at: Date;
        created_at: Date;
        snapshot: SystemValidationOverview;
      }>(
        `INSERT INTO system_validation_snapshots
          (ativo, timeframe, from_run, lookback_days, validation_version, state,
           ready_count, degraded_count, blocked_count, blocking_failures,
           evidence_hash, generated_at, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         ON CONFLICT (evidence_hash) DO NOTHING
         RETURNING id, ativo, timeframe, from_run, lookback_days, validation_version,
                   state, ready_count, degraded_count, blocked_count, blocking_failures,
                   evidence_hash, generated_at, created_at, snapshot`,
        [
          snapshot.scope.asset,
          snapshot.scope.timeframe,
          snapshot.scope.fromRun,
          snapshot.scope.lookbackDays,
          snapshot.version,
          snapshot.state,
          snapshot.summary.readyCount,
          snapshot.summary.degradedCount,
          snapshot.summary.blockedCount,
          snapshot.summary.blockingFailures,
          snapshot.evidenceHash,
          new Date(snapshot.generatedAt),
          JSON.stringify(snapshot),
        ],
      );

      const row = rows[0];
      if (row) {
        return {
          id: Number(row.id),
          ativo: row.ativo,
          timeframe: row.timeframe,
          fromRun: row.from_run === null ? null : Number(row.from_run),
          lookbackDays: Number(row.lookback_days),
          validationVersion: row.validation_version,
          state: row.state,
          readyCount: Number(row.ready_count),
          degradedCount: Number(row.degraded_count),
          blockedCount: Number(row.blocked_count),
          blockingFailures: Number(row.blocking_failures),
          evidenceHash: row.evidence_hash,
          generatedAt: new Date(row.generated_at),
          createdAt: new Date(row.created_at),
          snapshot: row.snapshot,
        };
      }

      const existing = await db.query<typeof rows[number]>(
        `SELECT id, ativo, timeframe, from_run, lookback_days, validation_version,
                state, ready_count, degraded_count, blocked_count, blocking_failures,
                evidence_hash, generated_at, created_at, snapshot
         FROM system_validation_snapshots
         WHERE evidence_hash = $1`,
        [snapshot.evidenceHash],
      );
      const existingRow = existing.rows[0];
      if (!existingRow) {
        throw new Error("System validation snapshot could not be persisted");
      }

      return {
        id: Number(existingRow.id),
        ativo: existingRow.ativo,
        timeframe: existingRow.timeframe,
        fromRun: existingRow.from_run === null ? null : Number(existingRow.from_run),
        lookbackDays: Number(existingRow.lookback_days),
        validationVersion: existingRow.validation_version,
        state: existingRow.state,
        readyCount: Number(existingRow.ready_count),
        degradedCount: Number(existingRow.degraded_count),
        blockedCount: Number(existingRow.blocked_count),
        blockingFailures: Number(existingRow.blocking_failures),
        evidenceHash: existingRow.evidence_hash,
        generatedAt: new Date(existingRow.generated_at),
        createdAt: new Date(existingRow.created_at),
        snapshot: existingRow.snapshot,
      };
    },

    async listSystemValidationSnapshots(
      filters: SystemValidationSnapshotFilters = {},
    ): Promise<SystemValidationSnapshotRecord[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", String(values.length)));
      };

      if (filters.ativo) add("rs.ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("rs.timeframe = ?", filters.timeframe);
      if (filters.fromRun !== null && filters.fromRun !== undefined) {
        add("from_run = ?", filters.fromRun);
      }

      const limit = filters.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("system validation snapshot history limit must be an integer between 1 and 100");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await db.query<{
        id: number;
        ativo: string;
        timeframe: Timeframe;
        from_run: number | null;
        lookback_days: number;
        validation_version: string;
        state: SystemValidationState;
        ready_count: number;
        degraded_count: number;
        blocked_count: number;
        blocking_failures: number;
        evidence_hash: string;
        generated_at: Date;
        created_at: Date;
        snapshot: SystemValidationOverview;
      }>(
        `SELECT id, ativo, timeframe, from_run, lookback_days, validation_version,
                state, ready_count, degraded_count, blocked_count, blocking_failures,
                evidence_hash, generated_at, created_at, snapshot
         FROM system_validation_snapshots
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limit}`,
        values,
      );

      return rows.map((row) => ({
        id: Number(row.id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        fromRun: row.from_run === null ? null : Number(row.from_run),
        lookbackDays: Number(row.lookback_days),
        validationVersion: row.validation_version,
        state: row.state,
        readyCount: Number(row.ready_count),
        degradedCount: Number(row.degraded_count),
        blockedCount: Number(row.blocked_count),
        blockingFailures: Number(row.blocking_failures),
        evidenceHash: row.evidence_hash,
        generatedAt: new Date(row.generated_at),
        createdAt: new Date(row.created_at),
        snapshot: row.snapshot,
      }));
    },

    async saveResearchSnapshot(input: SaveResearchSnapshotInput): Promise<ResearchSnapshotRecord> {
      const snapshot = input.snapshot;
      const { rows } = await db.query<{
        snapshot_id: string;
        schema_version: string;
        content_hash: string;
        signal_id: number;
        decision_log_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        data_as_of: Date;
        created_at: Date;
        snapshot: ResearchSnapshot;
      }>(
        `INSERT INTO research_snapshots
          (snapshot_id, schema_version, content_hash, signal_id, decision_log_id,
           ativo, timeframe, data_as_of, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         ON CONFLICT (snapshot_id) DO NOTHING
         RETURNING snapshot_id, schema_version, content_hash, signal_id,
                   decision_log_id, ativo, timeframe, data_as_of, created_at, snapshot`,
        [
          snapshot.snapshotId,
          snapshot.schemaVersion,
          snapshot.contentHash,
          snapshot.analysis.signalId,
          input.decisionLogId ?? null,
          snapshot.analysis.ativo,
          snapshot.analysis.timeframe,
          snapshot.analysis.dataAsOf,
          JSON.stringify(snapshot),
        ],
      );

      const row = rows[0];
      if (row) {
        return {
          snapshotId: row.snapshot_id,
          schemaVersion: row.schema_version,
          contentHash: row.content_hash,
          signalId: Number(row.signal_id),
          decisionLogId: row.decision_log_id === null ? null : Number(row.decision_log_id),
          ativo: row.ativo,
          timeframe: row.timeframe,
          dataAsOf: new Date(row.data_as_of),
          createdAt: new Date(row.created_at),
          snapshot: row.snapshot,
        };
      }

      const existing = await db.query<{
        snapshot_id: string;
        schema_version: string;
        content_hash: string;
        signal_id: number;
        decision_log_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        data_as_of: Date;
        created_at: Date;
        snapshot: ResearchSnapshot;
      }>(
        `SELECT snapshot_id, schema_version, content_hash, signal_id,
                decision_log_id, ativo, timeframe, data_as_of, created_at, snapshot
         FROM research_snapshots
         WHERE snapshot_id = $1`,
        [snapshot.snapshotId],
      );

      const existingRow = existing.rows[0];
      if (!existingRow) {
        throw new Error("Research snapshot could not be persisted");
      }
      if (existingRow.content_hash !== snapshot.contentHash) {
        throw new Error("Research snapshot ID collision with different content");
      }

      return {
        snapshotId: existingRow.snapshot_id,
        schemaVersion: existingRow.schema_version,
        contentHash: existingRow.content_hash,
        signalId: Number(existingRow.signal_id),
        decisionLogId: existingRow.decision_log_id === null ? null : Number(existingRow.decision_log_id),
        ativo: existingRow.ativo,
        timeframe: existingRow.timeframe,
        dataAsOf: new Date(existingRow.data_as_of),
        createdAt: new Date(existingRow.created_at),
        snapshot: existingRow.snapshot,
      };
    },

    async getResearchSnapshot(snapshotId: string): Promise<ResearchSnapshotRecord | null> {
      const normalized = snapshotId.trim();
      if (!normalized) throw new Error("snapshotId is required");

      const { rows } = await db.query<{
        snapshot_id: string;
        schema_version: string;
        content_hash: string;
        signal_id: number;
        decision_log_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        data_as_of: Date;
        created_at: Date;
        snapshot: ResearchSnapshot;
      }>(
        `SELECT snapshot_id, schema_version, content_hash, signal_id,
                decision_log_id, ativo, timeframe, data_as_of, created_at, snapshot
         FROM research_snapshots
         WHERE snapshot_id = $1`,
        [normalized],
      );

      const row = rows[0];
      if (!row) return null;

      return {
        snapshotId: row.snapshot_id,
        schemaVersion: row.schema_version,
        contentHash: row.content_hash,
        signalId: Number(row.signal_id),
        decisionLogId: row.decision_log_id === null ? null : Number(row.decision_log_id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        dataAsOf: new Date(row.data_as_of),
        createdAt: new Date(row.created_at),
        snapshot: row.snapshot,
      };
    },

    async listResearchSnapshots(
      filters: ResearchSnapshotFilters = {},
    ): Promise<ResearchSnapshotRecord[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", String(values.length)));
      };

      if (filters.ativo) add("dl.ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("dl.timeframe = ?", filters.timeframe);

      const limit = filters.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("research snapshot list limit must be an integer between 1 and 100");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await db.query<{
        snapshot_id: string;
        schema_version: string;
        content_hash: string;
        signal_id: number;
        decision_log_id: number | null;
        ativo: string;
        timeframe: Timeframe;
        data_as_of: Date;
        created_at: Date;
        snapshot: ResearchSnapshot;
      }>(
        `SELECT snapshot_id, schema_version, content_hash, signal_id,
                decision_log_id, ativo, timeframe, data_as_of, created_at, snapshot
         FROM research_snapshots rs
         ${where}
         ORDER BY data_as_of DESC, created_at DESC, snapshot_id DESC
         LIMIT ${limit}`,
        values,
      );

      return rows.map((row) => ({
        snapshotId: row.snapshot_id,
        schemaVersion: row.schema_version,
        contentHash: row.content_hash,
        signalId: Number(row.signal_id),
        decisionLogId: row.decision_log_id === null ? null : Number(row.decision_log_id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        dataAsOf: new Date(row.data_as_of),
        createdAt: new Date(row.created_at),
        snapshot: row.snapshot,
      }));
    },

    async saveTrade(input: SaveTradeInput): Promise<number> {
      asFinite(input.entryPrice, "entryPrice");
      asFinite(input.profitPercent, "profitPercent");
      if (input.entryPrice <= 0) throw new Error("entryPrice must be greater than zero");
      if (input.exitPrice !== null && input.exitPrice !== undefined) {
        asFinite(input.exitPrice, "exitPrice");
        if (input.exitPrice <= 0) throw new Error("exitPrice must be greater than zero");
      }
      if (input.drawdown !== null && input.drawdown !== undefined) {
        asFinite(input.drawdown, "drawdown");
      }
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO paper_trades
          (signal_id, entry_price, exit_price, outcome, profit_percent,
           gross_profit_percent, fee_percent, slippage_percent, candles_held,
           execution_model_version, exit_reason, max_favorable_excursion_percent,
           max_adverse_excursion_percent, drawdown, opened_at, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          input.signalId,
          input.entryPrice,
          input.exitPrice ?? null,
          input.outcome,
          input.profitPercent,
          input.grossProfitPercent ?? null,
          input.feePercent ?? null,
          input.slippagePercent ?? null,
          input.candlesHeld ?? null,
          input.executionModelVersion ?? null,
          input.exitReason ?? null,
          input.maxFavorableExcursionPercent ?? null,
          input.maxAdverseExcursionPercent ?? null,
          input.drawdown ?? null,
          input.openedAt ?? new Date(),
          input.closedAt ?? null,
        ],
      );
      const id = Number(rows[0]?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a valid trade id");
      return id;
    },

    async getMetricsByOrigem(backtestRunId?: number): Promise<MetricsByOrigem[]> {
      const { rows } = await db.query<MetricsByOrigem>(`
        WITH filtered AS (
          SELECT s.origem, t.id, t.outcome, t.profit_percent,
                 t.gross_profit_percent, t.fee_percent, t.slippage_percent,
                 t.candles_held, t.opened_at, t.closed_at
          FROM signals s
          INNER JOIN paper_trades t ON t.signal_id = s.id
          WHERE ($1::bigint IS NULL OR s.backtest_run_id = $1)
        ),
        closed AS (
          SELECT *,
            SUM(profit_percent) OVER (
              PARTITION BY origem
              ORDER BY COALESCE(closed_at, opened_at), id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS cumulative_profit
          FROM filtered
          WHERE outcome IN ('win', 'loss')
        ),
        drawdown_series AS (
          SELECT *,
            MAX(cumulative_profit) OVER (
              PARTITION BY origem
              ORDER BY COALESCE(closed_at, opened_at), id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_peak
          FROM closed
        ),
        trade_stats AS (
          SELECT
            origem,
            COUNT(*)::int AS total_trades,
            COUNT(*) FILTER (WHERE outcome IN ('win', 'loss'))::int AS closed_trades,
            COUNT(*) FILTER (WHERE outcome = 'open')::int AS open_trades
          FROM filtered
          GROUP BY origem
        ),
        performance AS (
          SELECT
            origem,
            COUNT(*)::int AS total,
            ROUND(COALESCE(AVG(CASE WHEN outcome = 'win' THEN 100.0 WHEN outcome = 'loss' THEN 0.0 END), 0), 1)::float AS win_rate,
            ROUND(SUM(profit_percent), 2)::float AS total_profit_percent,
            ROUND(AVG(profit_percent), 2)::float AS avg_profit_percent,
            ROUND(AVG(profit_percent), 2)::float AS expectancy_percent,
            ROUND(MAX(running_peak - cumulative_profit), 2)::float AS max_drawdown_percent,
            ROUND(SUM(gross_profit_percent), 2)::float AS gross_total_profit_percent,
            ROUND(SUM(fee_percent), 2)::float AS total_fee_percent,
            ROUND(SUM(slippage_percent), 2)::float AS total_slippage_percent,
            ROUND(AVG(candles_held), 2)::float AS avg_candles_held,
            ROUND(
              SUM(CASE WHEN profit_percent > 0 THEN profit_percent ELSE 0 END) /
              NULLIF(ABS(SUM(CASE WHEN profit_percent < 0 THEN profit_percent ELSE 0 END)), 0),
              2
            )::float AS profit_factor
          FROM drawdown_series
          GROUP BY origem
        )
        SELECT
          p.origem,
          p.total,
          ts.total_trades,
          ts.closed_trades,
          ts.open_trades,
          p.win_rate,
          p.profit_factor,
          p.total_profit_percent,
          p.avg_profit_percent,
          p.expectancy_percent,
          p.max_drawdown_percent,
          p.gross_total_profit_percent,
          p.total_fee_percent,
          p.total_slippage_percent,
          p.avg_candles_held
        FROM performance p
        INNER JOIN trade_stats ts ON ts.origem = p.origem
        ORDER BY p.origem
      `, [backtestRunId ?? null]);
      return rows.map((row) => ({
        origem: row.origem,
        total: Number(row.total),
        total_trades: Number(row.total_trades),
        closed_trades: Number(row.closed_trades),
        open_trades: Number(row.open_trades),
        win_rate: Number(row.win_rate),
        profit_factor: row.profit_factor === null ? null : Number(row.profit_factor),
        total_profit_percent: Number(row.total_profit_percent),
        avg_profit_percent: Number(row.avg_profit_percent),
        expectancy_percent: Number(row.expectancy_percent),
        max_drawdown_percent: Number(row.max_drawdown_percent),
        gross_total_profit_percent: Number(row.gross_total_profit_percent),
        total_fee_percent: Number(row.total_fee_percent),
        total_slippage_percent: Number(row.total_slippage_percent),
        avg_candles_held: Number(row.avg_candles_held),
      }));
    },


    async saveDecisionLog(input: DecisionLogInput): Promise<number> {
      asFinite(input.referencePrice, "referencePrice");
      if (input.referencePrice <= 0) throw new Error("referencePrice must be greater than zero");
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO decision_log
          (backtest_run_id, ativo, timeframe, decision_at, data_as_of, origem, recomendacao,
           jev_model_version, jev_choice, jev_probs, confidence, quality_score,
           risco_elevado, tamanho_posicao_pct, observacao, reference_price,
           target_pct, stop_pct, lookahead_candles, execution_model_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          input.backtestRunId ?? null,
          input.ativo,
          input.timeframe,
          input.decisionAt,
          input.dataAsOf,
          input.decision.origem,
          input.decision.recomendacao,
          input.decision.jevModelVersion ?? null,
          input.decision.jevChoice ?? null,
          input.decision.jevProbs ? JSON.stringify(input.decision.jevProbs) : null,
          input.decision.confidence ?? null,
          input.decision.qualityScore ?? null,
          input.decision.riscoElevado ?? null,
          input.decision.tamanhoPosicaoPct,
          input.decision.observacao ?? null,
          input.referencePrice,
          input.targetPct ?? null,
          input.stopPct ?? null,
          input.lookaheadCandles ?? null,
          input.executionModelVersion ?? null,
        ],
      );
      return Number(rows[0]?.id);
    },

    async getDecisionLog(id: number): Promise<DecisionLogRecord | null> {
      const { rows } = await db.query<{
        id: number;
        ativo: string;
        timeframe: Timeframe;
        decision_at: Date;
        data_as_of: Date;
        origem: DecisionResult["origem"];
        recomendacao: DecisionResult["recomendacao"];
        jev_model_version: string | null;
        jev_choice: DecisionResult["jevChoice"] | null;
        jev_probs: Record<string, number> | null;
        confidence: string | number | null;
        quality_score: string | number | null;
        risco_elevado: boolean | null;
        tamanho_posicao_pct: string | number;
        observacao: string | null;
        reference_price: string | number;
        outcome_status: "pending" | "settled" | "not_applicable";
        outcome_direction: "up" | "down" | "flat" | null;
        forward_return_percent: string | number | null;
        trade_profit_percent: string | number | null;
        exit_reason: "target" | "stop" | "end" | null;
        evaluated_at: Date | null;
      }>(
        `SELECT id, ativo, timeframe, decision_at, data_as_of, origem, recomendacao,
                jev_model_version, jev_choice, jev_probs, confidence, quality_score,
                risco_elevado, tamanho_posicao_pct, observacao, reference_price,
                outcome_status, outcome_direction, forward_return_percent,
                trade_profit_percent, exit_reason, evaluated_at
         FROM decision_log
         WHERE id = $1`,
        [id],
      );

      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        decisionAt: new Date(row.decision_at),
        dataAsOf: new Date(row.data_as_of),
        origem: row.origem,
        recomendacao: row.recomendacao,
        jevModelVersion: row.jev_model_version,
        jevChoice: row.jev_choice,
        jevProbs: row.jev_probs,
        confidence: row.confidence === null ? null : Number(row.confidence),
        qualityScore: row.quality_score === null ? null : Number(row.quality_score),
        riscoElevado: row.risco_elevado,
        tamanhoPosicaoPct: Number(row.tamanho_posicao_pct),
        observacao: row.observacao,
        referencePrice: Number(row.reference_price),
        outcomeStatus: row.outcome_status,
        outcomeDirection: row.outcome_direction,
        forwardReturnPercent: row.forward_return_percent === null ? null : Number(row.forward_return_percent),
        tradeProfitPercent: row.trade_profit_percent === null ? null : Number(row.trade_profit_percent),
        exitReason: row.exit_reason,
        evaluatedAt: row.evaluated_at ? new Date(row.evaluated_at) : null,
      };
    },

    async getPendingDecisionLogs(
      filters: PendingDecisionLogFilters = {},
    ): Promise<DecisionLogRecord[]> {
      const limit = filters.limit ?? 100;
      validateLimit(Math.min(limit, 100));

      const conditions = ["outcome_status = 'pending'"];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", `${values.length}`));
      };

      if (filters.ativo) add("dl.ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("dl.timeframe = ?", filters.timeframe);

      const limitParam = values.length + 1;
      const { rows } = await db.query<{
        id: number;
        ativo: string;
        timeframe: Timeframe;
        decision_at: Date;
        data_as_of: Date;
        origem: DecisionResult["origem"];
        recomendacao: DecisionResult["recomendacao"];
        jev_model_version: string | null;
        jev_choice: DecisionResult["jevChoice"] | null;
        jev_probs: Record<string, number> | null;
        confidence: string | number | null;
        quality_score: string | number | null;
        risco_elevado: boolean | null;
        tamanho_posicao_pct: string | number;
        observacao: string | null;
        reference_price: string | number;
        outcome_status: "pending" | "settled" | "not_applicable";
        outcome_direction: "up" | "down" | "flat" | null;
        forward_return_percent: string | number | null;
        trade_profit_percent: string | number | null;
        exit_reason: "target" | "stop" | "end" | null;
        evaluated_at: Date | null;
      }>(
        `SELECT id, ativo, timeframe, decision_at, data_as_of, origem, recomendacao,
                jev_model_version, jev_choice, jev_probs, confidence, quality_score,
                risco_elevado, tamanho_posicao_pct, observacao, reference_price,
                outcome_status, outcome_direction, forward_return_percent,
                trade_profit_percent, exit_reason, evaluated_at
         FROM decision_log
         WHERE ${conditions.join(" AND ")}
         ORDER BY data_as_of ASC, id ASC
         LIMIT ${limitParam}`,
        [...values, Math.min(limit, 100)],
      );

      return rows.map((row) => ({
        id: Number(row.id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        decisionAt: new Date(row.decision_at),
        dataAsOf: new Date(row.data_as_of),
        origem: row.origem,
        recomendacao: row.recomendacao,
        jevModelVersion: row.jev_model_version,
        jevChoice: row.jev_choice,
        jevProbs: row.jev_probs,
        confidence: row.confidence === null ? null : Number(row.confidence),
        qualityScore: row.quality_score === null ? null : Number(row.quality_score),
        riscoElevado: row.risco_elevado,
        tamanhoPosicaoPct: Number(row.tamanho_posicao_pct),
        observacao: row.observacao,
        referencePrice: Number(row.reference_price),
        outcomeStatus: row.outcome_status,
        outcomeDirection: row.outcome_direction,
        forwardReturnPercent:
          row.forward_return_percent === null ? null : Number(row.forward_return_percent),
        tradeProfitPercent:
          row.trade_profit_percent === null ? null : Number(row.trade_profit_percent),
        exitReason: row.exit_reason,
        evaluatedAt: row.evaluated_at ? new Date(row.evaluated_at) : null,
      }));
    },

    async getDecisionKpis(filters: DecisionKpiFilters = {}): Promise<DecisionKpis> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", `${values.length}`));
      };

      if (filters.ativo) add("dl.ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("dl.timeframe = ?", filters.timeframe);
      if (filters.origem) add("dl.origem = ?", filters.origem);
      if (filters.recomendacao) add("dl.recomendacao = ?", filters.recomendacao);
      if (filters.from) add("dl.decision_at >= ?", filters.from);
      if (filters.to) add("dl.decision_at <= ?", filters.to);
      if (filters.riskRegime) add("COALESCE(rs.snapshot->'risk'->'regime'->>'key', 'unknown') = ?", filters.riskRegime);

      const baseWhere = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const commonCte = `
        WITH base AS (
          SELECT
            dl.*,
            COALESCE(rs.snapshot->'risk'->'regime'->>'key', 'unknown') AS risk_regime
          FROM decision_log dl
          LEFT JOIN research_snapshots rs ON rs.decision_log_id = dl.id
          ${baseWhere}
        )
      `;

      const summaryResult = await db.query<{
        total_decisions: string;
        settled_decisions: string;
        pending_decisions: string;
        not_applicable_decisions: string;
        profitable_decisions: string;
        losing_decisions: string;
        flat_decisions: string;
        win_rate: string | null;
        avg_forward_return_percent: string | null;
        avg_trade_profit_percent: string | null;
        total_trade_profit_percent: string;
        avg_confidence: string | null;
        avg_quality_score: string | null;
        risk_elevated_decisions: string;
        buy_decisions: string;
        sell_decisions: string;
        wait_decisions: string;
      }>(
        `${commonCte}
         SELECT
           COUNT(*)::int AS total_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled')::int AS settled_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'pending')::int AS pending_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'not_applicable')::int AS not_applicable_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled' AND trade_profit_percent > 0)::int AS profitable_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled' AND trade_profit_percent < 0)::int AS losing_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled' AND ABS(COALESCE(trade_profit_percent, 0)) < 0.0000001)::int AS flat_decisions,
           ROUND(
             100.0 * COUNT(*) FILTER (WHERE outcome_status = 'settled' AND trade_profit_percent > 0) /
             NULLIF(COUNT(*) FILTER (WHERE outcome_status = 'settled'), 0),
             2
           )::float AS win_rate,
           ROUND(AVG(forward_return_percent) FILTER (WHERE outcome_status = 'settled'), 4)::float AS avg_forward_return_percent,
           ROUND(AVG(trade_profit_percent) FILTER (WHERE outcome_status = 'settled'), 4)::float AS avg_trade_profit_percent,
           ROUND(COALESCE(SUM(trade_profit_percent) FILTER (WHERE outcome_status = 'settled'), 0), 4)::float AS total_trade_profit_percent,
           ROUND(AVG(confidence) FILTER (WHERE confidence IS NOT NULL), 4)::float AS avg_confidence,
           ROUND(AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL), 4)::float AS avg_quality_score,
           COUNT(*) FILTER (WHERE risco_elevado = true)::int AS risk_elevated_decisions,
           COUNT(*) FILTER (WHERE recomendacao = 'BUY')::int AS buy_decisions,
           COUNT(*) FILTER (WHERE recomendacao = 'SELL')::int AS sell_decisions,
           COUNT(*) FILTER (WHERE recomendacao = 'WAIT')::int AS wait_decisions
         FROM base`,
        values,
      );

      const breakdownResult = await db.query<{
        origem: string;
        ativo: string;
        timeframe: Timeframe;
        recomendacao: DecisionResult["recomendacao"];
        risk_regime: string;
        total_decisions: string;
        settled_decisions: string;
        pending_decisions: string;
        not_applicable_decisions: string;
        profitable_decisions: string;
        losing_decisions: string;
        flat_decisions: string;
        win_rate: string | null;
        avg_forward_return_percent: string | null;
        avg_trade_profit_percent: string | null;
        total_trade_profit_percent: string;
        avg_confidence: string | null;
        avg_quality_score: string | null;
        risk_elevated_decisions: string;
        buy_decisions: string;
        sell_decisions: string;
        wait_decisions: string;
      }>(
        `${commonCte}
         SELECT
           origem,
           ativo,
           timeframe,
           recomendacao,
           risk_regime,
           COUNT(*)::int AS total_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled')::int AS settled_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'pending')::int AS pending_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'not_applicable')::int AS not_applicable_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled' AND trade_profit_percent > 0)::int AS profitable_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled' AND trade_profit_percent < 0)::int AS losing_decisions,
           COUNT(*) FILTER (WHERE outcome_status = 'settled' AND ABS(COALESCE(trade_profit_percent, 0)) < 0.0000001)::int AS flat_decisions,
           ROUND(
             100.0 * COUNT(*) FILTER (WHERE outcome_status = 'settled' AND trade_profit_percent > 0) /
             NULLIF(COUNT(*) FILTER (WHERE outcome_status = 'settled'), 0),
             2
           )::float AS win_rate,
           ROUND(AVG(forward_return_percent) FILTER (WHERE outcome_status = 'settled'), 4)::float AS avg_forward_return_percent,
           ROUND(AVG(trade_profit_percent) FILTER (WHERE outcome_status = 'settled'), 4)::float AS avg_trade_profit_percent,
           ROUND(COALESCE(SUM(trade_profit_percent) FILTER (WHERE outcome_status = 'settled'), 0), 4)::float AS total_trade_profit_percent,
           ROUND(AVG(confidence) FILTER (WHERE confidence IS NOT NULL), 4)::float AS avg_confidence,
           ROUND(AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL), 4)::float AS avg_quality_score,
           COUNT(*) FILTER (WHERE risco_elevado = true)::int AS risk_elevated_decisions,
           COUNT(*) FILTER (WHERE recomendacao = 'BUY')::int AS buy_decisions,
           COUNT(*) FILTER (WHERE recomendacao = 'SELL')::int AS sell_decisions,
           COUNT(*) FILTER (WHERE recomendacao = 'WAIT')::int AS wait_decisions
         FROM base
         GROUP BY origem, ativo, timeframe, recomendacao, risk_regime
         ORDER BY total_decisions DESC
         LIMIT 500`,
        values,
      );

      const mapSummary = (row: typeof summaryResult.rows[number]): DecisionKpiSummary => ({
        totalDecisions: Number(row.total_decisions),
        settledDecisions: Number(row.settled_decisions),
        pendingDecisions: Number(row.pending_decisions),
        notApplicableDecisions: Number(row.not_applicable_decisions),
        profitableDecisions: Number(row.profitable_decisions),
        losingDecisions: Number(row.losing_decisions),
        flatDecisions: Number(row.flat_decisions),
        winRate: row.win_rate === null ? null : Number(row.win_rate),
        avgForwardReturnPercent: row.avg_forward_return_percent === null ? null : Number(row.avg_forward_return_percent),
        avgTradeProfitPercent: row.avg_trade_profit_percent === null ? null : Number(row.avg_trade_profit_percent),
        totalTradeProfitPercent: Number(row.total_trade_profit_percent),
        avgConfidence: row.avg_confidence === null ? null : Number(row.avg_confidence),
        avgQualityScore: row.avg_quality_score === null ? null : Number(row.avg_quality_score),
        riskElevatedDecisions: Number(row.risk_elevated_decisions),
        buyDecisions: Number(row.buy_decisions),
        sellDecisions: Number(row.sell_decisions),
        waitDecisions: Number(row.wait_decisions),
      });

      const summary = mapSummary(summaryResult.rows[0] ?? {
        total_decisions: "0",
        settled_decisions: "0",
        pending_decisions: "0",
        not_applicable_decisions: "0",
        profitable_decisions: "0",
        losing_decisions: "0",
        flat_decisions: "0",
        win_rate: null,
        avg_forward_return_percent: null,
        avg_trade_profit_percent: null,
        total_trade_profit_percent: "0",
        avg_confidence: null,
        avg_quality_score: null,
        risk_elevated_decisions: "0",
        buy_decisions: "0",
        sell_decisions: "0",
        wait_decisions: "0",
      });

      return {
        filters,
        summary,
        breakdown: breakdownResult.rows.map((row) => ({
          ...mapSummary(row),
          origem: row.origem,
          ativo: row.ativo,
          timeframe: row.timeframe,
          recomendacao: row.recomendacao,
          riskRegime: row.risk_regime,
        })),
      };
    },

    async getDecisionCalibrationObservations(filters: DecisionKpiFilters = {}): Promise<CalibrationObservation[]> {
      const conditions: string[] = [
        "dl.outcome_status = 'settled'",
        "dl.trade_profit_percent IS NOT NULL",
        "dl.confidence IS NOT NULL",
      ];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", `${values.length}`));
      };

      if (filters.ativo) add("dl.ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("dl.timeframe = ?", filters.timeframe);
      if (filters.origem) add("dl.origem = ?", filters.origem);
      if (filters.recomendacao) add("dl.recomendacao = ?", filters.recomendacao);
      if (filters.from) add("dl.decision_at >= ?", filters.from);
      if (filters.to) add("dl.decision_at <= ?", filters.to);
      if (filters.riskRegime) {
        add(
          "COALESCE(rs.snapshot->'risk'->'regime'->>'key', 'unknown') = ?",
          filters.riskRegime,
        );
      }

      const { rows } = await db.query<{
        confidence: string | number;
        quality_score: string | number | null;
        trade_profit_percent: string | number;
        jev_choice: DecisionResult["jevChoice"] | null;
        predicted_probability: string | number | null;
        outcome_direction: "up" | "down" | "flat" | null;
        origem: string;
        ativo: string;
        timeframe: Timeframe;
        risk_regime: string;
      }>(
        `SELECT
           dl.confidence,
           dl.quality_score,
           dl.trade_profit_percent,
           dl.jev_choice,
           CASE
             WHEN dl.jev_choice = 'ALTA' THEN dl.jev_probs->>'ALTA'
             WHEN dl.jev_choice = 'BAIXA' THEN dl.jev_probs->>'BAIXA'
             ELSE NULL
           END AS predicted_probability,
           dl.outcome_direction,
           dl.origem,
           dl.ativo,
           dl.timeframe,
           COALESCE(rs.snapshot->'risk'->'regime'->>'key', 'unknown') AS risk_regime
         FROM decision_log dl
         LEFT JOIN research_snapshots rs ON rs.decision_log_id::text = dl.id::text
         WHERE ${conditions.join(" AND ")}
         ORDER BY dl.decision_at ASC
         LIMIT 10000`,
        values,
      );

      return rows.map((row) => ({
        confidence: Number(row.confidence),
        qualityScore: row.quality_score === null ? null : Number(row.quality_score),
        tradeProfitPercent: Number(row.trade_profit_percent),
        predictedProbability:
          row.predicted_probability === null ? null : Number(row.predicted_probability),
        predictedDirection:
          row.jev_choice === "ALTA" ? "up" : row.jev_choice === "BAIXA" ? "down" : null,
        outcomeDirection: row.outcome_direction,
        origem: row.origem,
        ativo: row.ativo,
        timeframe: row.timeframe,
        riskRegime: row.risk_regime,
      }));
    },

    async settleDecisionLog(id: number, outcome: DecisionLogOutcome): Promise<void> {
      const result = await db.query(
        `UPDATE decision_log
         SET outcome_status = $2,
             outcome_direction = $3,
             forward_return_percent = $4,
             trade_profit_percent = $5,
             exit_reason = $6,
             evaluated_at = $7
         WHERE id = $1 AND outcome_status = 'pending'`,
        [
          id,
          outcome.outcomeStatus,
          outcome.outcomeDirection ?? null,
          outcome.forwardReturnPercent ?? null,
          outcome.tradeProfitPercent ?? null,
          outcome.exitReason ?? null,
          outcome.evaluatedAt ?? new Date(),
        ],
      );
      if (result.rows.length === 0) {
        throw new Error("decision log is already settled or does not exist");
      }
    },

    async settleDecisionLogWithAudit(
      id: number,
      outcome: DecisionLogOutcome,
      audit: OutcomeSettlementAuditPayload,
    ): Promise<void> {
      if (audit.decisionLogId !== id) {
        throw new Error("settlement audit decisionLogId must match the decision log id");
      }
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const result = await client.query(
          `UPDATE decision_log
           SET outcome_status = $2,
               outcome_direction = $3,
               forward_return_percent = $4,
               trade_profit_percent = $5,
               exit_reason = $6,
               evaluated_at = $7
           WHERE id = $1 AND outcome_status = 'pending'
           RETURNING id`,
          [
            id,
            outcome.outcomeStatus,
            outcome.outcomeDirection ?? null,
            outcome.forwardReturnPercent ?? null,
            outcome.tradeProfitPercent ?? null,
            outcome.exitReason ?? null,
            outcome.evaluatedAt ?? new Date(),
          ],
        );

        if (result.rows.length === 0) {
          throw new Error("decision log is already settled or does not exist");
        }

        await client.query(
          `INSERT INTO outcome_settlement_audits (
             decision_log_id, audit_version, ativo, timeframe, recommendation,
             decision_at, data_as_of, evaluated_at, reference_price,
             lookahead_candles, flat_threshold_pct, outcome_status,
             outcome_direction, forward_return_percent, trade_profit_percent,
             exit_reason, evaluation_candle_open_time, evaluation_candle_close_time,
             evaluation_price, future_closed_candle_count, future_first_open_time,
             future_last_close_time, market_data_hash, evidence_hash,
             source, notes, audit
           )
           VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             $17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27::jsonb
           )`,
          [
            audit.decisionLogId,
            audit.version,
            audit.asset,
            audit.timeframe,
            audit.recommendation,
            audit.decisionAt,
            audit.dataAsOf,
            audit.evaluatedAt,
            audit.referencePrice,
            audit.lookaheadCandles,
            audit.flatThresholdPct,
            audit.outcomeStatus,
            audit.outcomeDirection,
            audit.forwardReturnPercent,
            audit.tradeProfitPercent,
            audit.exitReason,
            audit.evaluationCandleOpenTime,
            audit.evaluationCandleCloseTime,
            audit.evaluationPrice,
            audit.futureClosedCandleCount,
            audit.futureFirstOpenTime,
            audit.futureLastCloseTime,
            audit.marketDataHash,
            audit.evidenceHash,
            audit.source,
            JSON.stringify(audit.notes),
            JSON.stringify(audit),
          ],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async saveOutcomeSettlementAudit(
      audit: OutcomeSettlementAuditPayload,
    ): Promise<OutcomeSettlementAuditRecord> {
      const { rows } = await db.query<{
        id: number;
        created_at: Date;
      }>(
        `INSERT INTO outcome_settlement_audits (
           decision_log_id, audit_version, ativo, timeframe, recommendation,
           decision_at, data_as_of, evaluated_at, reference_price,
           lookahead_candles, flat_threshold_pct, outcome_status,
           outcome_direction, forward_return_percent, trade_profit_percent,
           exit_reason, evaluation_candle_open_time, evaluation_candle_close_time,
           evaluation_price, future_closed_candle_count, future_first_open_time,
           future_last_close_time, market_data_hash, evidence_hash,
           source, notes, audit
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27::jsonb
         )
         ON CONFLICT (decision_log_id) DO NOTHING
         RETURNING id, created_at`,
        [
          audit.decisionLogId,
          audit.version,
          audit.asset,
          audit.timeframe,
          audit.recommendation,
          audit.decisionAt,
          audit.dataAsOf,
          audit.evaluatedAt,
          audit.referencePrice,
          audit.lookaheadCandles,
          audit.flatThresholdPct,
          audit.outcomeStatus,
          audit.outcomeDirection,
          audit.forwardReturnPercent,
          audit.tradeProfitPercent,
          audit.exitReason,
          audit.evaluationCandleOpenTime,
          audit.evaluationCandleCloseTime,
          audit.evaluationPrice,
          audit.futureClosedCandleCount,
          audit.futureFirstOpenTime,
          audit.futureLastCloseTime,
          audit.marketDataHash,
          audit.evidenceHash,
          audit.source,
          JSON.stringify(audit.notes),
          JSON.stringify(audit),
        ],
      );

      let id = rows[0]?.id;
      let createdAt = rows[0]?.created_at;

      if (id === undefined || createdAt === undefined) {
        const existing = await this.getOutcomeSettlementAudit(audit.decisionLogId);
        if (!existing) throw new Error("Outcome settlement audit could not be persisted");
        if (existing.evidenceHash !== audit.evidenceHash) {
          throw new Error("Outcome settlement audit collision with different evidence");
        }
        return existing;
      }

      return {
        ...audit,
        id: Number(id),
        createdAt: new Date(createdAt),
      };
    },

    async getOutcomeSettlementAudit(
      decisionLogId: number,
    ): Promise<OutcomeSettlementAuditRecord | null> {
      if (!Number.isInteger(decisionLogId) || decisionLogId <= 0) {
        throw new Error("decision log id must be a positive integer");
      }

      const { rows } = await db.query<any>(
        `SELECT id, decision_log_id, audit_version, ativo, timeframe, recommendation,
                decision_at, data_as_of, evaluated_at, reference_price,
                lookahead_candles, flat_threshold_pct, outcome_status,
                outcome_direction, forward_return_percent, trade_profit_percent,
                exit_reason, evaluation_candle_open_time, evaluation_candle_close_time,
                evaluation_price, future_closed_candle_count, future_first_open_time,
                future_last_close_time, market_data_hash, evidence_hash,
                source, notes, audit, created_at
         FROM outcome_settlement_audits
         WHERE decision_log_id = $1`,
        [decisionLogId],
      );

      const row = rows[0];
      if (!row) return null;

      const audit = row.audit as OutcomeSettlementAuditPayload;
      return {
        ...audit,
        id: Number(row.id),
        createdAt: new Date(row.created_at),
      };
    },

    async listOutcomeSettlementAudits(
      filters: OutcomeSettlementAuditFilters = {},
    ): Promise<OutcomeSettlementAuditRecord[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", String(values.length)));
      };

      if (filters.decisionLogId !== null && filters.decisionLogId !== undefined) {
        add("decision_log_id = ?", filters.decisionLogId);
      }
      if (filters.ativo) add("ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("timeframe = ?", filters.timeframe);
      if (filters.from) add("evaluated_at >= ?", filters.from);
      if (filters.to) add("evaluated_at <= ?", filters.to);

      const limit = filters.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("settlement audit limit must be an integer between 1 and 100");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await db.query<any>(
        `SELECT id, decision_log_id, audit_version, ativo, timeframe, recommendation,
                decision_at, data_as_of, evaluated_at, reference_price,
                lookahead_candles, flat_threshold_pct, outcome_status,
                outcome_direction, forward_return_percent, trade_profit_percent,
                exit_reason, evaluation_candle_open_time, evaluation_candle_close_time,
                evaluation_price, future_closed_candle_count, future_first_open_time,
                future_last_close_time, market_data_hash, evidence_hash,
                source, notes, audit, created_at
         FROM outcome_settlement_audits
         ${where}
         ORDER BY evaluated_at DESC, id DESC
         LIMIT ${limit}`,
        values,
      );

      return rows.map((row) => ({
        ...(row.audit as OutcomeSettlementAuditPayload),
        id: Number(row.id),
        createdAt: new Date(row.created_at),
      }));
    },

    async getOutcomeSettlementAuditSummary(
      filters: Pick<OutcomeSettlementAuditFilters, "ativo" | "timeframe" | "from" | "to"> = {},
    ): Promise<OutcomeSettlementAuditSummary> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace("?", String(values.length)));
      };

      if (filters.ativo) add("dl.ativo = ?", filters.ativo.trim().toUpperCase());
      if (filters.timeframe) add("dl.timeframe = ?", filters.timeframe);
      if (filters.from) add("dl.decision_at >= ?", filters.from);
      if (filters.to) add("dl.decision_at <= ?", filters.to);

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await db.query<{
        finalized_decisions: string;
        settled_decisions: string;
        not_applicable_decisions: string;
        pending_decisions: string;
        audited_decisions: string;
        latest_evaluated_at: Date | null;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE dl.outcome_status IN ('settled','not_applicable'))::int AS finalized_decisions,
           COUNT(*) FILTER (WHERE dl.outcome_status = 'settled')::int AS settled_decisions,
           COUNT(*) FILTER (WHERE dl.outcome_status = 'not_applicable')::int AS not_applicable_decisions,
           COUNT(*) FILTER (WHERE dl.outcome_status = 'pending')::int AS pending_decisions,
           COUNT(osa.id)::int AS audited_decisions,
           MAX(dl.evaluated_at) AS latest_evaluated_at
         FROM decision_log dl
         LEFT JOIN outcome_settlement_audits osa ON osa.decision_log_id = dl.id
         ${where}`,
        values,
      );

      const row = rows[0];
      const finalizedDecisions = Number(row?.finalized_decisions ?? 0);
      const auditedDecisions = Number(row?.audited_decisions ?? 0);

      return {
        version: "outcome-settlement-audit.v1",
        filters: {
          ativo: filters.ativo?.trim().toUpperCase() ?? null,
          timeframe: filters.timeframe ?? null,
          from: filters.from ?? null,
          to: filters.to ?? null,
        },
        finalizedDecisions,
        settledDecisions: Number(row?.settled_decisions ?? 0),
        notApplicableDecisions: Number(row?.not_applicable_decisions ?? 0),
        pendingDecisions: Number(row?.pending_decisions ?? 0),
        auditedDecisions,
        coveragePct:
          finalizedDecisions > 0
            ? Number(((auditedDecisions / finalizedDecisions) * 100).toFixed(2))
            : null,
        latestEvaluatedAt: row?.latest_evaluated_at ? new Date(row.latest_evaluated_at) : null,
      };
    },

    async createBenchmarkRun(input: BenchmarkRunInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO benchmark_runs
          (source_run_id, ativo, timeframe, periodo_inicio, periodo_fim, oos_start_ratio,
           candles_total, dataset_hash, execution_model_version, target_pct, stop_pct,
           lookahead_candles, slippage_pct, fee_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          input.sourceRunId ?? null,
          input.ativo,
          input.timeframe,
          input.periodoInicio,
          input.periodoFim,
          input.oosStartRatio ?? null,
          input.candlesTotal ?? null,
          input.datasetHash ?? null,
          input.executionModelVersion ?? null,
          input.targetPct ?? null,
          input.stopPct ?? null,
          input.lookaheadCandles ?? null,
          input.slippagePct ?? null,
          input.feePct ?? null,
        ],
      );
      const id = Number(rows[0]?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a valid benchmark run id");
      return id;
    },

    async saveBenchmarkResult(input: BenchmarkResultInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO benchmark_results
          (benchmark_run_id, estrategia, status, total_trades, closed_trades, open_trades,
           win_rate, profit_factor, total_profit_percent, avg_profit_percent, expectancy_percent,
           max_drawdown_percent, gross_total_profit_percent, total_fee_percent,
           total_slippage_percent, avg_candles_held, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (benchmark_run_id, estrategia) DO UPDATE SET
           status=EXCLUDED.status,
           total_trades=EXCLUDED.total_trades,
           closed_trades=EXCLUDED.closed_trades,
           open_trades=EXCLUDED.open_trades,
           win_rate=EXCLUDED.win_rate,
           profit_factor=EXCLUDED.profit_factor,
           total_profit_percent=EXCLUDED.total_profit_percent,
           avg_profit_percent=EXCLUDED.avg_profit_percent,
           expectancy_percent=EXCLUDED.expectancy_percent,
           max_drawdown_percent=EXCLUDED.max_drawdown_percent,
           gross_total_profit_percent=EXCLUDED.gross_total_profit_percent,
           total_fee_percent=EXCLUDED.total_fee_percent,
           total_slippage_percent=EXCLUDED.total_slippage_percent,
           avg_candles_held=EXCLUDED.avg_candles_held,
           notas=EXCLUDED.notas
         RETURNING id`,
        [
          input.benchmarkRunId,
          input.estrategia,
          input.status,
          input.totalTrades ?? 0,
          input.closedTrades ?? 0,
          input.openTrades ?? 0,
          input.winRate ?? null,
          input.profitFactor ?? null,
          input.totalProfitPercent ?? 0,
          input.avgProfitPercent ?? 0,
          input.expectancyPercent ?? 0,
          input.maxDrawdownPercent ?? 0,
          input.grossTotalProfitPercent ?? 0,
          input.totalFeePercent ?? 0,
          input.totalSlippagePercent ?? 0,
          input.avgCandlesHeld ?? null,
          input.notas ?? null,
        ],
      );
      return Number(rows[0]?.id);
    },

    async getBenchmarkResults(benchmarkRunId: number) {
      const { rows } = await db.query(
        `SELECT estrategia, status, total_trades, closed_trades, open_trades,
                win_rate, profit_factor, total_profit_percent, avg_profit_percent,
                expectancy_percent, max_drawdown_percent, gross_total_profit_percent,
                total_fee_percent, total_slippage_percent, avg_candles_held, notas
         FROM benchmark_results
         WHERE benchmark_run_id = $1
         ORDER BY estrategia`,
        [benchmarkRunId],
      );
      return rows;
    },


    async createWalkForwardRun(input: WalkForwardRunInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO walk_forward_runs
          (ativo, timeframe, dataset_start, dataset_end, candles_total, dataset_hash,
           initial_train_candles, test_candles, step_candles, lookahead_candles,
           execution_model_version, target_pct, stop_pct, slippage_pct, fee_pct, threshold_frozen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          input.ativo,
          input.timeframe,
          input.datasetStart,
          input.datasetEnd,
          input.candlesTotal,
          input.datasetHash,
          input.initialTrainCandles,
          input.testCandles,
          input.stepCandles,
          input.lookaheadCandles,
          input.executionModelVersion,
          input.targetPct,
          input.stopPct,
          input.slippagePct,
          input.feePct,
          input.thresholdFrozenAt ?? null,
        ],
      );
      const id = Number(rows[0]?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a valid walk-forward run id");
      return id;
    },

    async createWalkForwardPortfolioRun(input: WalkForwardPortfolioRunSummaryInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO walk_forward_portfolio_runs
          (walk_forward_run_id, strategy, initial_capital, position_size_pct, max_gross_exposure_pct,
           portfolio_model_version, final_equity, total_return_pct, cagr_pct, max_drawdown_pct,
           sharpe, sortino, total_signals, executed_trades, closed_trades, rejected_trades,
           winning_trades, losing_trades, total_realized_pnl, total_fees, total_slippage,
           max_open_positions, max_gross_exposure, risk_gate_blocks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         ON CONFLICT (walk_forward_run_id, strategy) DO UPDATE SET
           initial_capital=EXCLUDED.initial_capital,
           position_size_pct=EXCLUDED.position_size_pct,
           max_gross_exposure_pct=EXCLUDED.max_gross_exposure_pct,
           portfolio_model_version=EXCLUDED.portfolio_model_version,
           final_equity=EXCLUDED.final_equity,
           total_return_pct=EXCLUDED.total_return_pct,
           cagr_pct=EXCLUDED.cagr_pct,
           max_drawdown_pct=EXCLUDED.max_drawdown_pct,
           sharpe=EXCLUDED.sharpe,
           sortino=EXCLUDED.sortino,
           total_signals=EXCLUDED.total_signals,
           executed_trades=EXCLUDED.executed_trades,
           closed_trades=EXCLUDED.closed_trades,
           rejected_trades=EXCLUDED.rejected_trades,
           winning_trades=EXCLUDED.winning_trades,
           losing_trades=EXCLUDED.losing_trades,
           total_realized_pnl=EXCLUDED.total_realized_pnl,
           total_fees=EXCLUDED.total_fees,
           total_slippage=EXCLUDED.total_slippage,
           max_open_positions=EXCLUDED.max_open_positions,
           max_gross_exposure=EXCLUDED.max_gross_exposure,
           risk_gate_blocks=EXCLUDED.risk_gate_blocks
         RETURNING id`,
        [
          input.walkForwardRunId, input.strategy, input.initialCapital, input.positionSizePct,
          input.maxGrossExposurePct, input.portfolioModelVersion, input.finalEquity,
          input.totalReturnPct, input.cagrPct ?? null, input.maxDrawdownPct, input.sharpe ?? null,
          input.sortino ?? null, input.totalSignals, input.executedTrades, input.closedTrades,
          input.rejectedTrades, input.winningTrades, input.losingTrades, input.totalRealizedPnl,
          input.totalFees, input.totalSlippage, input.maxOpenPositions, input.maxGrossExposure,
          input.riskGateBlocks,
        ],
      );
      return Number(rows[0]?.id);
    },

    async saveWalkForwardPortfolioFold(input: WalkForwardPortfolioFoldInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO walk_forward_portfolio_folds
          (walk_forward_portfolio_run_id, walk_forward_run_id, fold_number, initial_capital,
           final_equity, total_return_pct, max_drawdown_pct, sharpe, sortino, total_signals,
           executed_trades, closed_trades, rejected_trades, winning_trades, losing_trades,
           total_realized_pnl, total_fees, total_slippage, max_open_positions,
           max_gross_exposure, risk_gate_blocks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (walk_forward_portfolio_run_id, fold_number) DO UPDATE SET
           initial_capital=EXCLUDED.initial_capital,
           final_equity=EXCLUDED.final_equity,
           total_return_pct=EXCLUDED.total_return_pct,
           max_drawdown_pct=EXCLUDED.max_drawdown_pct,
           sharpe=EXCLUDED.sharpe,
           sortino=EXCLUDED.sortino,
           total_signals=EXCLUDED.total_signals,
           executed_trades=EXCLUDED.executed_trades,
           closed_trades=EXCLUDED.closed_trades,
           rejected_trades=EXCLUDED.rejected_trades,
           winning_trades=EXCLUDED.winning_trades,
           losing_trades=EXCLUDED.losing_trades,
           total_realized_pnl=EXCLUDED.total_realized_pnl,
           total_fees=EXCLUDED.total_fees,
           total_slippage=EXCLUDED.total_slippage,
           max_open_positions=EXCLUDED.max_open_positions,
           max_gross_exposure=EXCLUDED.max_gross_exposure,
           risk_gate_blocks=EXCLUDED.risk_gate_blocks
         RETURNING id`,
        [
          input.walkForwardPortfolioRunId, input.walkForwardRunId, input.foldNumber,
          input.initialCapital, input.finalEquity, input.totalReturnPct, input.maxDrawdownPct,
          input.sharpe ?? null, input.sortino ?? null, input.totalSignals, input.executedTrades,
          input.closedTrades, input.rejectedTrades, input.winningTrades, input.losingTrades,
          input.totalRealizedPnl, input.totalFees, input.totalSlippage, input.maxOpenPositions,
          input.maxGrossExposure, input.riskGateBlocks,
        ],
      );
      return Number(rows[0]?.id);
    },

    async saveWalkForwardPortfolioEquityPoints(points: WalkForwardPortfolioEquityInput[]): Promise<void> {
      if (!points.length) return;
      const payload = points.map((point) => ({
        walk_forward_portfolio_run_id: point.walkForwardPortfolioRunId,
        fold_number: point.foldNumber,
        as_of: point.asOf,
        equity: point.equity,
        cash: point.cash,
        realized_pnl: point.realizedPnl,
        unrealized_pnl: point.unrealizedPnl,
        gross_exposure: point.grossExposure,
        open_positions: point.openPositions,
        drawdown_pct: point.drawdownPct,
      }));
      await db.query(
        `INSERT INTO walk_forward_portfolio_equity
          (walk_forward_portfolio_run_id, fold_number, as_of, equity, cash, realized_pnl,
           unrealized_pnl, gross_exposure, open_positions, drawdown_pct)
         SELECT walk_forward_portfolio_run_id, fold_number, as_of, equity, cash, realized_pnl,
                unrealized_pnl, gross_exposure, open_positions, drawdown_pct
         FROM jsonb_to_recordset($1::jsonb) AS x(
           walk_forward_portfolio_run_id BIGINT,
           fold_number INT,
           as_of TIMESTAMPTZ,
           equity NUMERIC,
           cash NUMERIC,
           realized_pnl NUMERIC,
           unrealized_pnl NUMERIC,
           gross_exposure NUMERIC,
           open_positions INT,
           drawdown_pct NUMERIC
         )
         ON CONFLICT (walk_forward_portfolio_run_id, as_of) DO UPDATE SET
           fold_number=EXCLUDED.fold_number,
           equity=EXCLUDED.equity,
           cash=EXCLUDED.cash,
           realized_pnl=EXCLUDED.realized_pnl,
           unrealized_pnl=EXCLUDED.unrealized_pnl,
           gross_exposure=EXCLUDED.gross_exposure,
           open_positions=EXCLUDED.open_positions,
           drawdown_pct=EXCLUDED.drawdown_pct`,
        [JSON.stringify(payload)],
      );
    },

    async getWalkForwardPortfolioRuns(walkForwardRunId: number) {
      const { rows } = await db.query(
        `SELECT id, walk_forward_run_id, strategy, initial_capital, position_size_pct,
                max_gross_exposure_pct, portfolio_model_version, final_equity, total_return_pct,
                cagr_pct, max_drawdown_pct, sharpe, sortino, total_signals, executed_trades,
                closed_trades, rejected_trades, winning_trades, losing_trades, total_realized_pnl,
                total_fees, total_slippage, max_open_positions, max_gross_exposure, risk_gate_blocks
         FROM walk_forward_portfolio_runs
         WHERE walk_forward_run_id=$1
         ORDER BY strategy`,
        [walkForwardRunId],
      );
      return rows;
    },

    async getWalkForwardPortfolioFolds(walkForwardPortfolioRunId: number) {
      const { rows } = await db.query(
        `SELECT fold_number, initial_capital, final_equity, total_return_pct, max_drawdown_pct,
                sharpe, sortino, total_signals, executed_trades, closed_trades, rejected_trades,
                winning_trades, losing_trades, total_realized_pnl, total_fees, total_slippage,
                max_open_positions, max_gross_exposure, risk_gate_blocks
         FROM walk_forward_portfolio_folds
         WHERE walk_forward_portfolio_run_id=$1
         ORDER BY fold_number`,
        [walkForwardPortfolioRunId],
      );
      return rows;
    },

    async getWalkForwardRun(walkForwardRunId: number) {
      const { rows } = await db.query<{
        id: number;
        ativo: string;
        timeframe: Timeframe;
        dataset_start: Date;
        dataset_end: Date;
        candles_total: number;
        dataset_hash: string;
        initial_train_candles: number;
        test_candles: number;
        step_candles: number;
        lookahead_candles: number;
        execution_model_version: string;
        target_pct: string | number;
        stop_pct: string | number;
        slippage_pct: string | number;
        fee_pct: string | number;
      }>(
        `SELECT id, ativo, timeframe, dataset_start, dataset_end, candles_total, dataset_hash,
                initial_train_candles, test_candles, step_candles, lookahead_candles,
                execution_model_version, target_pct, stop_pct, slippage_pct, fee_pct
         FROM walk_forward_runs
         WHERE id=$1`,
        [walkForwardRunId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        ativo: row.ativo,
        timeframe: row.timeframe,
        datasetStart: new Date(row.dataset_start),
        datasetEnd: new Date(row.dataset_end),
        candlesTotal: Number(row.candles_total),
        datasetHash: row.dataset_hash,
        initialTrainCandles: Number(row.initial_train_candles),
        testCandles: Number(row.test_candles),
        stepCandles: Number(row.step_candles),
        lookaheadCandles: Number(row.lookahead_candles),
        executionModelVersion: row.execution_model_version,
        targetPct: Number(row.target_pct),
        stopPct: Number(row.stop_pct),
        slippagePct: Number(row.slippage_pct),
        feePct: Number(row.fee_pct),
      };
    },

    async saveWalkForwardFold(input: WalkForwardFoldInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO walk_forward_folds
          (walk_forward_run_id, fold_number, train_start, train_end, test_start, test_end,
           estrategia, status, test_signals, total_trades, closed_trades, open_trades,
           win_rate, profit_factor, total_profit_percent, avg_profit_percent, expectancy_percent,
           max_drawdown_percent, gross_total_profit_percent, total_fee_percent, total_slippage_percent,
           avg_candles_held, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (walk_forward_run_id, fold_number, estrategia) DO UPDATE SET
           status=EXCLUDED.status,
           test_signals=EXCLUDED.test_signals,
           total_trades=EXCLUDED.total_trades,
           closed_trades=EXCLUDED.closed_trades,
           open_trades=EXCLUDED.open_trades,
           win_rate=EXCLUDED.win_rate,
           profit_factor=EXCLUDED.profit_factor,
           total_profit_percent=EXCLUDED.total_profit_percent,
           avg_profit_percent=EXCLUDED.avg_profit_percent,
           expectancy_percent=EXCLUDED.expectancy_percent,
           max_drawdown_percent=EXCLUDED.max_drawdown_percent,
           gross_total_profit_percent=EXCLUDED.gross_total_profit_percent,
           total_fee_percent=EXCLUDED.total_fee_percent,
           total_slippage_percent=EXCLUDED.total_slippage_percent,
           avg_candles_held=EXCLUDED.avg_candles_held,
           notas=EXCLUDED.notas
         RETURNING id`,
        [
          input.walkForwardRunId,
          input.foldNumber,
          input.trainStart,
          input.trainEnd,
          input.testStart,
          input.testEnd,
          input.estrategia,
          input.status,
          input.testSignals ?? 0,
          input.totalTrades ?? 0,
          input.closedTrades ?? 0,
          input.openTrades ?? 0,
          input.winRate ?? null,
          input.profitFactor ?? null,
          input.totalProfitPercent ?? 0,
          input.avgProfitPercent ?? 0,
          input.expectancyPercent ?? 0,
          input.maxDrawdownPercent ?? 0,
          input.grossTotalProfitPercent ?? 0,
          input.totalFeePercent ?? 0,
          input.totalSlippagePercent ?? 0,
          input.avgCandlesHeld ?? null,
          input.notas ?? null,
        ],
      );
      return Number(rows[0]?.id);
    },

    async getWalkForwardFolds(walkForwardRunId: number) {
      const { rows } = await db.query(
        `SELECT fold_number, train_start, train_end, test_start, test_end, estrategia,
                status, test_signals, total_trades, closed_trades, open_trades,
                win_rate, profit_factor, total_profit_percent, avg_profit_percent,
                expectancy_percent, max_drawdown_percent, gross_total_profit_percent,
                total_fee_percent, total_slippage_percent, avg_candles_held, notas
         FROM walk_forward_folds
         WHERE walk_forward_run_id = $1
         ORDER BY fold_number, estrategia`,
        [walkForwardRunId],
      );
      return rows;
    },


    async getPortfolioSourceTrades(backtestRunId: number): Promise<PortfolioSourceTrade[]> {
      const { rows } = await db.query<{
        paper_trade_id: string | number;
        side: "BUY" | "SELL";
        entry_price: string | number;
        exit_price: string | number | null;
        outcome: "win" | "loss" | "open";
        profit_percent: string | number;
        gross_profit_percent: string | number | null;
        fee_percent: string | number | null;
        slippage_percent: string | number | null;
        opened_at: Date;
        closed_at: Date | null;
      }>(
        `SELECT t.id AS paper_trade_id,
                s.recomendacao AS side,
                t.entry_price,
                t.exit_price,
                t.outcome,
                t.profit_percent,
                t.gross_profit_percent,
                t.fee_percent,
                t.slippage_percent,
                t.opened_at,
                t.closed_at
         FROM signals s
         INNER JOIN paper_trades t ON t.signal_id = s.id
         WHERE s.backtest_run_id = $1
           AND s.recomendacao IN ('BUY', 'SELL')
         ORDER BY t.opened_at ASC, t.id ASC`,
        [backtestRunId],
      );
      return rows.map((row) => ({
        paperTradeId: Number(row.paper_trade_id),
        side: row.side,
        entryPrice: Number(row.entry_price),
        exitPrice: row.exit_price === null ? null : Number(row.exit_price),
        outcome: row.outcome,
        profitPercent: Number(row.profit_percent),
        grossProfitPercent: row.gross_profit_percent === null ? null : Number(row.gross_profit_percent),
        feePercent: row.fee_percent === null ? null : Number(row.fee_percent),
        slippagePercent: row.slippage_percent === null ? null : Number(row.slippage_percent),
        openedAt: new Date(row.opened_at),
        closedAt: row.closed_at ? new Date(row.closed_at) : null,
      }));
    },

    async createPortfolioRun(input: PortfolioRunInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO portfolio_runs
          (source_backtest_run_id, ativo, timeframe, initial_capital, final_equity,
           position_size_pct, max_gross_exposure_pct, portfolio_model_version,
           dataset_hash, total_return_pct, max_drawdown_pct)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,0,0)
         RETURNING id`,
        [
          input.sourceBacktestRunId,
          input.ativo,
          input.timeframe,
          input.initialCapital,
          input.positionSizePct,
          input.maxGrossExposurePct,
          input.portfolioModelVersion,
          input.datasetHash,
        ],
      );
      const id = Number(rows[0]?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a valid portfolio run id");
      return id;
    },

    async savePortfolioPosition(input: PortfolioPositionInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO portfolio_positions
          (portfolio_run_id, paper_trade_id, side, allocated_notional, entry_price, exit_price,
           opened_at, closed_at, status, net_pnl, gross_pnl, fees, slippage, return_pct, rejection_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          input.portfolioRunId,
          input.paperTradeId,
          input.side,
          input.allocatedNotional,
          input.entryPrice,
          input.exitPrice ?? null,
          input.openedAt,
          input.closedAt ?? null,
          input.status,
          input.netPnl ?? 0,
          input.grossPnl ?? 0,
          input.fees ?? 0,
          input.slippage ?? 0,
          input.returnPct ?? 0,
          input.rejectionReason ?? null,
        ],
      );
      return Number(rows[0]?.id);
    },

    async savePortfolioEquityPoint(input: PortfolioEquityPointInput): Promise<number> {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO portfolio_equity_curve
          (portfolio_run_id, as_of, equity, cash, realized_pnl, unrealized_pnl,
           gross_exposure, open_positions, drawdown_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (portfolio_run_id, as_of) DO UPDATE SET
           equity=EXCLUDED.equity,
           cash=EXCLUDED.cash,
           realized_pnl=EXCLUDED.realized_pnl,
           unrealized_pnl=EXCLUDED.unrealized_pnl,
           gross_exposure=EXCLUDED.gross_exposure,
           open_positions=EXCLUDED.open_positions,
           drawdown_pct=EXCLUDED.drawdown_pct
         RETURNING id`,
        [
          input.portfolioRunId,
          input.asOf,
          input.equity,
          input.cash,
          input.realizedPnl,
          input.unrealizedPnl,
          input.grossExposure,
          input.openPositions,
          input.drawdownPct,
        ],
      );
      return Number(rows[0]?.id);
    },


    async savePortfolioPositions(inputs: PortfolioPositionInput[]): Promise<number> {
      if (inputs.length === 0) return 0;
      await db.query(
        `INSERT INTO portfolio_positions
          (portfolio_run_id, paper_trade_id, side, allocated_notional, entry_price, exit_price,
           opened_at, closed_at, status, net_pnl, gross_pnl, fees, slippage, return_pct, rejection_reason)
         SELECT portfolio_run_id, paper_trade_id, side, allocated_notional, entry_price, exit_price,
                opened_at, closed_at, status, net_pnl, gross_pnl, fees, slippage, return_pct, rejection_reason
         FROM jsonb_to_recordset($1::jsonb) AS x(
           portfolio_run_id bigint, paper_trade_id bigint, side text, allocated_notional numeric,
           entry_price numeric, exit_price numeric, opened_at timestamptz, closed_at timestamptz,
           status text, net_pnl numeric, gross_pnl numeric, fees numeric, slippage numeric,
           return_pct numeric, rejection_reason text
         )`,
        [JSON.stringify(inputs.map((item) => ({
          portfolio_run_id: item.portfolioRunId,
          paper_trade_id: item.paperTradeId,
          side: item.side,
          allocated_notional: item.allocatedNotional,
          entry_price: item.entryPrice,
          exit_price: item.exitPrice ?? null,
          opened_at: item.openedAt,
          closed_at: item.closedAt ?? null,
          status: item.status,
          net_pnl: item.netPnl ?? 0,
          gross_pnl: item.grossPnl ?? 0,
          fees: item.fees ?? 0,
          slippage: item.slippage ?? 0,
          return_pct: item.returnPct ?? 0,
          rejection_reason: item.rejectionReason ?? null,
        })))],
      );
      return inputs.length;
    },

    async savePortfolioEquityPoints(inputs: PortfolioEquityPointInput[]): Promise<number> {
      if (inputs.length === 0) return 0;
      await db.query(
        `INSERT INTO portfolio_equity_curve
          (portfolio_run_id, as_of, equity, cash, realized_pnl, unrealized_pnl,
           gross_exposure, open_positions, drawdown_pct)
         SELECT portfolio_run_id, as_of, equity, cash, realized_pnl, unrealized_pnl,
                gross_exposure, open_positions, drawdown_pct
         FROM jsonb_to_recordset($1::jsonb) AS x(
           portfolio_run_id bigint, as_of timestamptz, equity numeric, cash numeric,
           realized_pnl numeric, unrealized_pnl numeric, gross_exposure numeric,
           open_positions integer, drawdown_pct numeric
         )
         ON CONFLICT (portfolio_run_id, as_of) DO UPDATE SET
           equity=EXCLUDED.equity, cash=EXCLUDED.cash,
           realized_pnl=EXCLUDED.realized_pnl, unrealized_pnl=EXCLUDED.unrealized_pnl,
           gross_exposure=EXCLUDED.gross_exposure, open_positions=EXCLUDED.open_positions,
           drawdown_pct=EXCLUDED.drawdown_pct`,
        [JSON.stringify(inputs.map((item) => ({
          portfolio_run_id: item.portfolioRunId,
          as_of: item.asOf,
          equity: item.equity,
          cash: item.cash,
          realized_pnl: item.realizedPnl,
          unrealized_pnl: item.unrealizedPnl,
          gross_exposure: item.grossExposure,
          open_positions: item.openPositions,
          drawdown_pct: item.drawdownPct,
        })))],
      );
      return inputs.length;
    },
    async finalizePortfolioRun(runId: number, summary: PortfolioRunSummary): Promise<void> {
      await db.query(
        `UPDATE portfolio_runs
         SET final_equity=$2,
             total_return_pct=$3,
             cagr_pct=$4,
             max_drawdown_pct=$5,
             sharpe=$6,
             sortino=$7,
             total_trades=$8,
             closed_trades=$9,
             winning_trades=$10,
             losing_trades=$11,
             rejected_trades=$12,
             total_realized_pnl=$13,
             total_unrealized_pnl=$14,
             total_fees=$15,
             total_slippage=$16
         WHERE id=$1`,
        [
          runId,
          summary.finalEquity,
          summary.totalReturnPct,
          summary.cagrPct ?? null,
          summary.maxDrawdownPct,
          summary.sharpe ?? null,
          summary.sortino ?? null,
          summary.totalTrades,
          summary.closedTrades,
          summary.winningTrades,
          summary.losingTrades,
          summary.rejectedTrades,
          summary.totalRealizedPnl,
          summary.totalUnrealizedPnl,
          summary.totalFees,
          summary.totalSlippage,
        ],
      );
    },

    async getPortfolioRun(runId: number) {
      const { rows } = await db.query(
        `SELECT id, source_backtest_run_id, ativo, timeframe, initial_capital,
                final_equity, position_size_pct, max_gross_exposure_pct,
                portfolio_model_version, dataset_hash, total_return_pct, cagr_pct,
                max_drawdown_pct, sharpe, sortino, total_trades, closed_trades,
                winning_trades, losing_trades, rejected_trades, total_realized_pnl,
                total_unrealized_pnl, total_fees, total_slippage, created_at
         FROM portfolio_runs WHERE id=$1`,
        [runId],
      );
      return rows[0] ?? null;
    },

    async getPortfolioEquityCurve(runId: number, limit = 5000) {
      validateLimit(limit);
      const { rows } = await db.query(
        `SELECT as_of, equity, cash, realized_pnl, unrealized_pnl,
                gross_exposure, open_positions, drawdown_pct
         FROM portfolio_equity_curve
         WHERE portfolio_run_id=$1
         ORDER BY as_of ASC
         LIMIT $2`,
        [runId, limit],
      );
      return rows;
    },

    async freezeConfigThresholds(userId: string): Promise<void> {
      if (!userId.trim()) throw new Error("userId is required");
      await db.query(
        `INSERT INTO config (user_id, thresholds_congelados_em)
         VALUES ($1, now())
         ON CONFLICT (user_id)
         DO UPDATE SET thresholds_congelados_em = COALESCE(config.thresholds_congelados_em, now())`,
        [userId],
      );
    },

    async saveMarketData(ativo: string, timeframe: Timeframe, klines: Kline[]): Promise<number> {
      if (klines.length === 0) return 0;
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        let count = 0;
        for (const k of klines) {
          await client.query(
            `INSERT INTO market_data
              (ativo, timeframe, open_time, open, high, low, close, volume)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (ativo, timeframe, open_time)
             DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
               low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`,
            [ativo, timeframe, k.openTime, k.open, k.high, k.low, k.close, k.volume],
          );
          count++;
        }
        await client.query("COMMIT");
        return count;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getMarketData(ativo: string, timeframe: Timeframe, limit = 500): Promise<Kline[]> {
      validateLimit(limit);
      const { rows } = await db.query<{
        openTime: Date;
        open: string | number;
        high: string | number;
        low: string | number;
        close: string | number;
        volume: string | number;
      }>(
        `SELECT open_time AS "openTime", open, high, low, close, volume
         FROM market_data
         WHERE ativo = $1 AND timeframe = $2
         ORDER BY open_time DESC
         LIMIT $3`,
        [ativo, timeframe, limit],
      );
      return rows.map((row) => ({
        openTime: new Date(row.openTime),
        closeTime: new Date(new Date(row.openTime).getTime() + timeframeDurationMs(timeframe) - 1),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      })).reverse();
    },

    async getMarketDataRange(
      ativo: string,
      timeframe: Timeframe,
      startTime: Date,
      endTime: Date,
    ): Promise<Kline[]> {
      const { rows } = await db.query<{
        openTime: Date;
        open: string | number;
        high: string | number;
        low: string | number;
        close: string | number;
        volume: string | number;
      }>(
        `SELECT open_time AS "openTime", open, high, low, close, volume
         FROM market_data
         WHERE ativo = $1 AND timeframe = $2 AND open_time >= $3 AND open_time <= $4
         ORDER BY open_time ASC`,
        [ativo, timeframe, startTime, endTime],
      );
      return rows.map((row) => ({
        openTime: new Date(row.openTime),
        closeTime: new Date(new Date(row.openTime).getTime() + timeframeDurationMs(timeframe) - 1),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }));
    },

    async health(): Promise<boolean> {
      await db.query("SELECT 1");
      return true;
    },
  };
}

export const createBacktestRun = (input: BacktestRunInput) =>
  createRepository(getDefaultPool()).createBacktestRun(input);

export const getBacktestRun = (id: number) =>
  createRepository(getDefaultPool()).getBacktestRun(id);

export const createWalkForwardRun = (input: WalkForwardRunInput) => createRepository(getDefaultPool()).createWalkForwardRun(input);
export const getWalkForwardRun = (walkForwardRunId: number) =>
  createRepository(getDefaultPool()).getWalkForwardRun(walkForwardRunId);
export const createWalkForwardPortfolioRun = (input: WalkForwardPortfolioRunSummaryInput) =>
  createRepository(getDefaultPool()).createWalkForwardPortfolioRun(input);
export const saveWalkForwardPortfolioFold = (input: WalkForwardPortfolioFoldInput) =>
  createRepository(getDefaultPool()).saveWalkForwardPortfolioFold(input);
export const saveWalkForwardPortfolioEquityPoints = (inputs: WalkForwardPortfolioEquityInput[]) =>
  createRepository(getDefaultPool()).saveWalkForwardPortfolioEquityPoints(inputs);
export const getWalkForwardPortfolioRuns = (walkForwardRunId: number) =>
  createRepository(getDefaultPool()).getWalkForwardPortfolioRuns(walkForwardRunId);
export const getWalkForwardPortfolioFolds = (walkForwardPortfolioRunId: number) =>
  createRepository(getDefaultPool()).getWalkForwardPortfolioFolds(walkForwardPortfolioRunId);


export const saveWalkForwardFold = (input: WalkForwardFoldInput) => createRepository(getDefaultPool()).saveWalkForwardFold(input);
export const getWalkForwardFolds = (walkForwardRunId: number) => createRepository(getDefaultPool()).getWalkForwardFolds(walkForwardRunId);

export const getPortfolioSourceTrades = (backtestRunId: number) => createRepository(getDefaultPool()).getPortfolioSourceTrades(backtestRunId);
export const createPortfolioRun = (input: PortfolioRunInput) => createRepository(getDefaultPool()).createPortfolioRun(input);

export const savePortfolioPositions = (inputs: PortfolioPositionInput[]) => createRepository(getDefaultPool()).savePortfolioPositions(inputs);
export const savePortfolioEquityPoints = (inputs: PortfolioEquityPointInput[]) => createRepository(getDefaultPool()).savePortfolioEquityPoints(inputs);
export const savePortfolioPosition = (input: PortfolioPositionInput) => createRepository(getDefaultPool()).savePortfolioPosition(input);
export const savePortfolioEquityPoint = (input: PortfolioEquityPointInput) => createRepository(getDefaultPool()).savePortfolioEquityPoint(input);
export const finalizePortfolioRun = (runId: number, summary: PortfolioRunSummary) => createRepository(getDefaultPool()).finalizePortfolioRun(runId, summary);
export const getPortfolioRun = (runId: number) => createRepository(getDefaultPool()).getPortfolioRun(runId);
export const getPortfolioEquityCurve = (runId: number, limit = 5000) => createRepository(getDefaultPool()).getPortfolioEquityCurve(runId, limit);

export interface PortfolioPositionRow {
  id: number;
  portfolioRunId: number;
  paperTradeId: number;
  side: "BUY" | "SELL";
  allocatedNotional: number;
  entryPrice: number;
  exitPrice: number | null;
  openedAt: Date;
  closedAt: Date | null;
  status: "closed" | "liquidated_end" | "rejected";
  netPnl: number | null;
  grossPnl: number | null;
  fees: number | null;
  slippage: number | null;
  returnPct: number | null;
  rejectionReason: string | null;
}

export const getPortfolioPositions = async (runId: number): Promise<PortfolioPositionRow[]> => {
  const { rows } = await getDefaultPool().query<{
    id: number;
    portfolio_run_id: number;
    paper_trade_id: number;
    side: "BUY" | "SELL";
    allocated_notional: string | number;
    entry_price: string | number;
    exit_price: string | number | null;
    opened_at: Date;
    closed_at: Date | null;
    status: "closed" | "liquidated_end" | "rejected";
    net_pnl: string | number | null;
    gross_pnl: string | number | null;
    fees: string | number | null;
    slippage: string | number | null;
    return_pct: string | number | null;
    rejection_reason: string | null;
  }>(
    `SELECT id, portfolio_run_id, paper_trade_id, side, allocated_notional,
            entry_price, exit_price, opened_at, closed_at, status, net_pnl,
            gross_pnl, fees, slippage, return_pct, rejection_reason
     FROM portfolio_positions
     WHERE portfolio_run_id=$1
     ORDER BY opened_at ASC, id ASC`,
    [runId],
  );

  return rows.map((row) => ({
    id: row.id,
    portfolioRunId: row.portfolio_run_id,
    paperTradeId: row.paper_trade_id,
    side: row.side,
    allocatedNotional: Number(row.allocated_notional),
    entryPrice: Number(row.entry_price),
    exitPrice: row.exit_price === null ? null : Number(row.exit_price),
    openedAt: new Date(row.opened_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    status: row.status,
    netPnl: row.net_pnl === null ? null : Number(row.net_pnl),
    grossPnl: row.gross_pnl === null ? null : Number(row.gross_pnl),
    fees: row.fees === null ? null : Number(row.fees),
    slippage: row.slippage === null ? null : Number(row.slippage),
    returnPct: row.return_pct === null ? null : Number(row.return_pct),
    rejectionReason: row.rejection_reason,
  }));
};

export const saveDecisionLog = (input: DecisionLogInput) => createRepository(getDefaultPool()).saveDecisionLog(input);
export const getDecisionKpis = (filters: DecisionKpiFilters = {}) => createRepository(getDefaultPool()).getDecisionKpis(filters);
export const getDecisionCalibrationObservations = (filters: DecisionKpiFilters = {}) =>
  createRepository(getDefaultPool()).getDecisionCalibrationObservations(filters);
export const getDecisionLog = (id: number) => createRepository(getDefaultPool()).getDecisionLog(id);
export const getPendingDecisionLogs = (filters: PendingDecisionLogFilters = {}) =>
  createRepository(getDefaultPool()).getPendingDecisionLogs(filters);
export const settleDecisionLog = (id: number, outcome: DecisionLogOutcome) => createRepository(getDefaultPool()).settleDecisionLog(id, outcome);
export const settleDecisionLogWithAudit = (
  id: number,
  outcome: DecisionLogOutcome,
  audit: OutcomeSettlementAuditPayload,
) => createRepository(getDefaultPool()).settleDecisionLogWithAudit(id, outcome, audit);
export const saveOutcomeSettlementAudit = (audit: OutcomeSettlementAuditPayload) =>
  createRepository(getDefaultPool()).saveOutcomeSettlementAudit(audit);
export const getOutcomeSettlementAudit = (decisionLogId: number) =>
  createRepository(getDefaultPool()).getOutcomeSettlementAudit(decisionLogId);
export const listOutcomeSettlementAudits = (filters: OutcomeSettlementAuditFilters = {}) =>
  createRepository(getDefaultPool()).listOutcomeSettlementAudits(filters);
export const getOutcomeSettlementAuditSummary = (
  filters: Pick<OutcomeSettlementAuditFilters, "ativo" | "timeframe" | "from" | "to"> = {},
) => createRepository(getDefaultPool()).getOutcomeSettlementAuditSummary(filters);

export const createBenchmarkRun = (input: BenchmarkRunInput) => createRepository(getDefaultPool()).createBenchmarkRun(input);
export const saveBenchmarkResult = (input: BenchmarkResultInput) => createRepository(getDefaultPool()).saveBenchmarkResult(input);
export const getBenchmarkResults = (benchmarkRunId: number) => createRepository(getDefaultPool()).getBenchmarkResults(benchmarkRunId);

export const saveOosValidationGateAudit = (input: SaveOosValidationGateAuditInput) =>
  createRepository(getDefaultPool()).saveOosValidationGateAudit(input);
export const getOosValidationGateAudit = (id: number) =>
  createRepository(getDefaultPool()).getOosValidationGateAudit(id);
export const listOosValidationGateAudits = (filters: OosValidationGateAuditFilters = {}) =>
  createRepository(getDefaultPool()).listOosValidationGateAudits(filters);

export const savePipelineAuditSnapshot = (input: SavePipelineAuditSnapshotInput) =>
  createRepository(getDefaultPool()).savePipelineAuditSnapshot(input);
export const getPipelineAuditSnapshot = (id: number) =>
  createRepository(getDefaultPool()).getPipelineAuditSnapshot(id);
export const listPipelineAuditSnapshots = (filters: PipelineAuditSnapshotFilters = {}) =>
  createRepository(getDefaultPool()).listPipelineAuditSnapshots(filters);

export const saveSystemValidationSnapshot = (input: SaveSystemValidationSnapshotInput) =>
  createRepository(getDefaultPool()).saveSystemValidationSnapshot(input);
export const listSystemValidationSnapshots = (filters: SystemValidationSnapshotFilters = {}) =>
  createRepository(getDefaultPool()).listSystemValidationSnapshots(filters);

export const saveResearchSnapshot = (input: SaveResearchSnapshotInput) =>
  createRepository(getDefaultPool()).saveResearchSnapshot(input);
export const listResearchSnapshots = (filters: ResearchSnapshotFilters = {}) =>
  createRepository(getDefaultPool()).listResearchSnapshots(filters);

export const getResearchSnapshot = (snapshotId: string) =>
  createRepository(getDefaultPool()).getResearchSnapshot(snapshotId);

export const saveSignal = (
  ativo: string,
  timeframe: Timeframe,
  decision: DecisionResult,
  levels?: Pick<SaveSignalInput, "entrada" | "stop" | "alvo">,
  backtestRunId?: number | null,
) => createRepository(getDefaultPool()).saveSignal({ ativo, timeframe, decision, ...levels, backtestRunId });

export const saveTrade = (
  signalId: number,
  entryPrice: number,
  exitPrice: number | null,
  outcome: "win" | "loss" | "open",
  profitPercent: number,
  options?: Pick<
    SaveTradeInput,
    | "drawdown"
    | "grossProfitPercent"
    | "feePercent"
    | "slippagePercent"
    | "candlesHeld"
    | "executionModelVersion"
    | "exitReason"
    | "maxFavorableExcursionPercent"
    | "maxAdverseExcursionPercent"
    | "openedAt"
    | "closedAt"
  >,
) => createRepository(getDefaultPool()).saveTrade({
  signalId, entryPrice, exitPrice, outcome, profitPercent, ...options,
});

export const getMetricsByOrigem = (backtestRunId?: number) => createRepository(getDefaultPool()).getMetricsByOrigem(backtestRunId);
export const freezeConfigThresholds = (userId: string) => createRepository(getDefaultPool()).freezeConfigThresholds(userId);
export const saveMarketData = (ativo: string, timeframe: Timeframe, klines: Kline[]) =>
  createRepository(getDefaultPool()).saveMarketData(ativo, timeframe, klines);
export const getMarketData = (ativo: string, timeframe: Timeframe, limit = 500) =>
  createRepository(getDefaultPool()).getMarketData(ativo, timeframe, limit);
export const getMarketDataRange = (ativo: string, timeframe: Timeframe, startTime: Date, endTime: Date) =>
  createRepository(getDefaultPool()).getMarketDataRange(ativo, timeframe, startTime, endTime);
export const healthDatabase = () => createRepository(getDefaultPool()).health();
export { getDefaultPool as getPool };
