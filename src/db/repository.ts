import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { DecisionResult, Kline, Timeframe } from "../types.js";

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
  estrategia: "baseline" | "buyhold" | "jev";
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
          (engine, mode, ativo, timeframe, periodo_inicio, periodo_fim, oos_start_ratio, thresholds_congelados_em, candles_total, dataset_hash,
           execution_model_version, target_pct, stop_pct, lookahead_candles, slippage_pct, fee_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          input.engine,
          input.mode,
          input.ativo,
          input.timeframe,
          input.periodoInicio,
          input.periodoFim,
          input.oosStartRatio ?? null,
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
                oos_start_ratio, thresholds_congelados_em, candles_total, dataset_hash,
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
          SELECT s.origem, t.id, t.outcome, t.profit_percent, t.opened_at, t.closed_at
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

    async settleDecisionLog(id: number, outcome: DecisionLogOutcome): Promise<void> {
      await db.query(
        `UPDATE decision_log
         SET outcome_status = $2,
             outcome_direction = $3,
             forward_return_percent = $4,
             trade_profit_percent = $5,
             exit_reason = $6,
             evaluated_at = $7
         WHERE id = $1`,
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

export const saveDecisionLog = (input: DecisionLogInput) => createRepository(getDefaultPool()).saveDecisionLog(input);
export const settleDecisionLog = (id: number, outcome: DecisionLogOutcome) => createRepository(getDefaultPool()).settleDecisionLog(id, outcome);
export const createBenchmarkRun = (input: BenchmarkRunInput) => createRepository(getDefaultPool()).createBenchmarkRun(input);
export const saveBenchmarkResult = (input: BenchmarkResultInput) => createRepository(getDefaultPool()).saveBenchmarkResult(input);
export const getBenchmarkResults = (benchmarkRunId: number) => createRepository(getDefaultPool()).getBenchmarkResults(benchmarkRunId);

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
