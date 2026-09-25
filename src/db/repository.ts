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
  openedAt?: Date;
  closedAt?: Date | null;
}

export interface MetricsByOrigem {
  origem: string;
  total: number;
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  win_rate: number;
  profit_factor: number | null;
}

function requireDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function createInMemoryPool(): RepositoryPool {
  let nextRunId = 1;
  let nextSignalId = 1;
  let nextTradeId = 1;

  const runs = new Map<number, any>();
  const signals = new Map<number, any>();
  const trades = new Map<number, any>();
  const marketData = new Map<string, any>();
  const config = new Map<string, any>();

  const queryHandler = async <T extends QueryResultRow = any>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> => {
    const trimmed = text.trim();

    if (trimmed.startsWith("SELECT 1")) {
      return { rows: [{ "?column?": 1 } as unknown as T] };
    }

    if (trimmed.includes("INSERT INTO backtest_runs")) {
      const id = nextRunId++;
      const [
        engine,
        mode,
        ativo,
        timeframe,
        periodo_inicio,
        periodo_fim,
        oos_start_ratio,
        thresholds_congelados_em,
        candles_total,
        dataset_hash,
      ] = values;
      runs.set(id, {
        id,
        engine,
        mode,
        ativo,
        timeframe,
        periodo_inicio,
        periodo_fim,
        oos_start_ratio,
        thresholds_congelados_em,
        candles_total,
        dataset_hash,
        criado_em: new Date(),
      });
      return { rows: [{ id } as unknown as T] };
    }

    if (trimmed.includes("FROM backtest_runs") && trimmed.includes("WHERE id = $1")) {
      const id = Number(values[0]);
      const run = runs.get(id);
      return { rows: run ? [run as T] : [] };
    }

    if (trimmed.includes("INSERT INTO signals")) {
      const id = nextSignalId++;
      const [
        backtest_run_id,
        ativo,
        timeframe,
        entrada,
        stop,
        alvo,
        origem,
        jev_choice,
        jev_probs,
        jev_model_version,
        quality_score,
        risco_elevado,
        recomendacao,
        tamanho_posicao_pct,
        observacao,
      ] = values;
      signals.set(id, {
        id,
        backtest_run_id: backtest_run_id ?? null,
        ativo,
        timeframe,
        entrada: entrada ?? null,
        stop: stop ?? null,
        alvo: alvo ?? null,
        origem,
        jev_choice: jev_choice ?? null,
        jev_probs: jev_probs ?? null,
        jev_model_version: jev_model_version ?? null,
        quality_score: quality_score ?? null,
        risco_elevado: risco_elevado ?? null,
        recomendacao,
        tamanho_posicao_pct,
        observacao: observacao ?? null,
      });
      return { rows: [{ id } as unknown as T] };
    }

    if (trimmed.includes("INSERT INTO paper_trades")) {
      const id = nextTradeId++;
      const [
        signal_id,
        entry_price,
        exit_price,
        outcome,
        profit_percent,
        drawdown,
        opened_at,
        closed_at,
      ] = values;
      trades.set(id, {
        id,
        signal_id: Number(signal_id),
        entry_price: Number(entry_price),
        exit_price: exit_price !== null && exit_price !== undefined ? Number(exit_price) : null,
        outcome,
        profit_percent: Number(profit_percent),
        drawdown: drawdown !== null && drawdown !== undefined ? Number(drawdown) : null,
        opened_at: opened_at ?? new Date(),
        closed_at: closed_at ?? null,
      });
      return { rows: [{ id } as unknown as T] };
    }

    if (trimmed.includes("GROUP BY s.origem")) {
      const filterRunId = values[0] !== null && values[0] !== undefined ? Number(values[0]) : null;
      const groups = new Map<string, {
        origem: string;
        total: number;
        total_trades: number;
        closed_trades: number;
        open_trades: number;
        wins: number;
        totalClosedForWinRate: number;
        profitWins: number;
        lossAbs: number;
      }>();

      for (const t of trades.values()) {
        const s = signals.get(t.signal_id);
        if (!s) continue;
        if (filterRunId !== null && s.backtest_run_id !== filterRunId) continue;

        let g = groups.get(s.origem);
        if (!g) {
          g = {
            origem: s.origem,
            total: 0,
            total_trades: 0,
            closed_trades: 0,
            open_trades: 0,
            wins: 0,
            totalClosedForWinRate: 0,
            profitWins: 0,
            lossAbs: 0,
          };
          groups.set(s.origem, g);
        }

        g.total_trades++;
        if (t.outcome === "open") {
          g.open_trades++;
        } else if (t.outcome === "win" || t.outcome === "loss") {
          g.total++;
          g.closed_trades++;
          g.totalClosedForWinRate++;
          if (t.outcome === "win") g.wins++;
          if (t.profit_percent > 0) g.profitWins += t.profit_percent;
          if (t.profit_percent < 0) g.lossAbs += Math.abs(t.profit_percent);
        }
      }

      const rows: any[] = [];
      const sortedOrigens = Array.from(groups.keys()).sort();
      for (const origem of sortedOrigens) {
        const g = groups.get(origem)!;
        const win_rate = g.totalClosedForWinRate > 0
          ? Math.round((g.wins / g.totalClosedForWinRate) * 1000) / 10
          : 0;
        const profit_factor = g.lossAbs > 0
          ? Math.round((g.profitWins / g.lossAbs) * 100) / 100
          : null;
        rows.push({
          origem: g.origem,
          total: g.total,
          total_trades: g.total_trades,
          closed_trades: g.closed_trades,
          open_trades: g.open_trades,
          win_rate,
          profit_factor,
        });
      }

      return { rows: rows as T[] };
    }

    if (trimmed.includes("INSERT INTO config")) {
      const [userId] = values;
      config.set(String(userId), {
        userId,
        thresholds_congelados_em: new Date(),
      });
      return { rows: [] };
    }

    if (trimmed.includes("INSERT INTO market_data")) {
      const [ativo, timeframe, open_time, open, high, low, close, volume] = values;
      const key = `${ativo}:${timeframe}:${new Date(open_time as any).getTime()}`;
      marketData.set(key, {
        ativo,
        timeframe,
        open_time: new Date(open_time as any),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      });
      return { rows: [] };
    }

    if (trimmed.includes("FROM market_data") && trimmed.includes("ORDER BY open_time DESC")) {
      const [ativo, timeframe, limit] = values;
      const filtered: any[] = [];
      for (const item of marketData.values()) {
        if (item.ativo === ativo && item.timeframe === timeframe) {
          filtered.push({
            openTime: item.open_time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
          });
        }
      }
      filtered.sort((a, b) => b.openTime.getTime() - a.openTime.getTime());
      return { rows: filtered.slice(0, Number(limit)) as T[] };
    }

    if (trimmed.includes("FROM market_data") && trimmed.includes("open_time >=")) {
      const [ativo, timeframe, startTime, endTime] = values;
      const startMs = new Date(startTime as any).getTime();
      const endMs = new Date(endTime as any).getTime();
      const filtered: any[] = [];
      for (const item of marketData.values()) {
        const timeMs = item.open_time.getTime();
        if (item.ativo === ativo && item.timeframe === timeframe && timeMs >= startMs && timeMs <= endMs) {
          filtered.push({
            openTime: item.open_time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
          });
        }
      }
      filtered.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
      return { rows: filtered as T[] };
    }

    if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    query: queryHandler,
    connect: async () =>
      ({
        query: queryHandler as any,
        release: () => {},
      } as unknown as PoolClient),
  };
}

class ResilientPool implements RepositoryPool {
  private inMemory: RepositoryPool = createInMemoryPool();
  private pgPool: Pool | null = null;
  private warned = false;

  constructor(connectionString?: string) {
    if (connectionString) {
      try {
        this.pgPool = new pg.Pool({ connectionString });
      } catch {
        this.pgPool = null;
      }
    }
  }

  async query<T extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    if (this.pgPool) {
      try {
        return await this.pgPool.query<T>(text, values);
      } catch (err: any) {
        if (!this.warned) {
          console.warn("[AI Studio] PostgreSQL query failed, switching to in-memory mock repository:", err.message);
          this.warned = true;
        }
        return this.inMemory.query<T>(text, values);
      }
    }
    return this.inMemory.query<T>(text, values);
  }

  async connect(): Promise<PoolClient> {
    if (this.pgPool) {
      try {
        return await this.pgPool.connect();
      } catch (err: any) {
        if (!this.warned) {
          console.warn("[AI Studio] PostgreSQL connect failed, switching to in-memory mock repository:", err.message);
          this.warned = true;
        }
        return this.inMemory.connect();
      }
    }
    return this.inMemory.connect();
  }
}

let defaultPool: RepositoryPool | null = null;

function getDefaultPool(): RepositoryPool {
  if (!defaultPool) {
    const connStr = requireDatabaseUrl();
    if (connStr) {
      defaultPool = new ResilientPool(connStr);
    } else {
      console.warn("[AI Studio] DATABASE_URL not set — using in-memory mock repository");
      defaultPool = createInMemoryPool();
    }
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
          (engine, mode, ativo, timeframe, periodo_inicio, periodo_fim, oos_start_ratio, thresholds_congelados_em, candles_total, dataset_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
        criado_em: Date;
      }>(
        `SELECT id, engine, mode, ativo, timeframe, periodo_inicio, periodo_fim,
                oos_start_ratio, thresholds_congelados_em, candles_total, dataset_hash, criado_em
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
          (signal_id, entry_price, exit_price, outcome, profit_percent, drawdown, opened_at, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          input.signalId,
          input.entryPrice,
          input.exitPrice ?? null,
          input.outcome,
          input.profitPercent,
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
        SELECT
          s.origem,
          COUNT(CASE WHEN t.outcome IN ('win', 'loss') THEN 1 END)::int AS total,
          COUNT(*)::int AS total_trades,
          COUNT(CASE WHEN t.outcome IN ('win', 'loss') THEN 1 END)::int AS closed_trades,
          COUNT(CASE WHEN t.outcome = 'open' THEN 1 END)::int AS open_trades,
          ROUND(
            COALESCE(AVG(CASE WHEN t.outcome = 'win' THEN 100.0 WHEN t.outcome = 'loss' THEN 0.0 ELSE NULL END), 0),
            1
          )::float AS win_rate,
          ROUND(
            SUM(CASE WHEN t.outcome IN ('win', 'loss') AND t.profit_percent > 0 THEN t.profit_percent ELSE 0 END) /
            NULLIF(ABS(SUM(CASE WHEN t.outcome IN ('win', 'loss') AND t.profit_percent < 0 THEN t.profit_percent ELSE 0 END)), 0),
            2
          )::float AS profit_factor
        FROM signals s
        INNER JOIN paper_trades t ON t.signal_id = s.id
        WHERE ($1::bigint IS NULL OR s.backtest_run_id = $1)
        GROUP BY s.origem
        ORDER BY s.origem
      `, [backtestRunId ?? null]);
      return rows.map((row) => ({
        origem: row.origem,
        total: Number(row.total),
        total_trades: Number(row.total_trades),
        closed_trades: Number(row.closed_trades),
        open_trades: Number(row.open_trades),
        win_rate: Number(row.win_rate),
        profit_factor: row.profit_factor === null ? null : Number(row.profit_factor),
      }));
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
  options?: Pick<SaveTradeInput, "drawdown" | "openedAt" | "closedAt">,
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
