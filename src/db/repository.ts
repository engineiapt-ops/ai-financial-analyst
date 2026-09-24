import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { DecisionResult, Kline, Timeframe } from "../types.js";

export interface RepositoryPool {
  query<T extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<PoolClient>;
}

export interface SaveSignalInput {
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
  win_rate: number;
  profit_factor: number | null;
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
    async saveSignal(input: SaveSignalInput): Promise<number> {
      const { ativo, timeframe, decision } = input;
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO signals
          (ativo, timeframe, entrada, stop, alvo, origem, jev_choice, jev_probs,
           jev_model_version, quality_score, risco_elevado, recomendacao,
           tamanho_posicao_pct, observacao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
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

    async getMetricsByOrigem(): Promise<MetricsByOrigem[]> {
      const { rows } = await db.query<MetricsByOrigem>(`
        SELECT
          s.origem,
          COUNT(*)::int AS total,
          ROUND(AVG(CASE WHEN t.outcome = 'win' THEN 100.0 ELSE 0.0 END), 1)::float AS win_rate,
          ROUND(
            SUM(CASE WHEN t.profit_percent > 0 THEN t.profit_percent ELSE 0 END) /
            NULLIF(ABS(SUM(CASE WHEN t.profit_percent < 0 THEN t.profit_percent ELSE 0 END)), 0),
            2
          )::float AS profit_factor
        FROM signals s
        INNER JOIN paper_trades t ON t.signal_id = s.id
        WHERE t.outcome IN ('win', 'loss')
        GROUP BY s.origem
        ORDER BY s.origem
      `);
      return rows.map((row) => ({
        origem: row.origem,
        total: Number(row.total),
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

    async health(): Promise<boolean> {
      await db.query("SELECT 1");
      return true;
    },
  };
}

export const saveSignal = (
  ativo: string,
  timeframe: Timeframe,
  decision: DecisionResult,
  levels?: Pick<SaveSignalInput, "entrada" | "stop" | "alvo">,
) => createRepository(getDefaultPool()).saveSignal({ ativo, timeframe, decision, ...levels });

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

export const getMetricsByOrigem = () => createRepository(getDefaultPool()).getMetricsByOrigem();
export const freezeConfigThresholds = (userId: string) => createRepository(getDefaultPool()).freezeConfigThresholds(userId);
export const saveMarketData = (ativo: string, timeframe: Timeframe, klines: Kline[]) =>
  createRepository(getDefaultPool()).saveMarketData(ativo, timeframe, klines);
export const getMarketData = (ativo: string, timeframe: Timeframe, limit = 500) =>
  createRepository(getDefaultPool()).getMarketData(ativo, timeframe, limit);
export const healthDatabase = () => createRepository(getDefaultPool()).health();
export { getDefaultPool as getPool };
