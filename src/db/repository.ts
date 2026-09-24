import pg from "pg";
import type { DecisionResult, Kline, Timeframe } from "../types.js";

let pool: any;
try {
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  } else {
    throw new Error("No DATABASE_URL configured");
  }
} catch {
  console.warn("[AI Studio] DB not connected — mock active");
  pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  };
}

let mockSignalId = 1;
const inMemorySignals = new Map<number, any>();
const inMemoryTrades = new Map<number, any>();
const inMemoryMarketData = new Map<string, any>();

export async function saveSignal(ativo: string, timeframe: Timeframe, decision: DecisionResult): Promise<number> {
  try {
    if (process.env.DATABASE_URL) {
      const { rows } = await pool.query(
        `INSERT INTO signals
          (ativo, timeframe, origem, jev_choice, jev_probs, jev_model_version,
           quality_score, risco_elevado, recomendacao, tamanho_posicao_pct, observacao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ativo, timeframe, decision.origem, decision.jevChoice ?? null,
         decision.jevProbs ? JSON.stringify(decision.jevProbs) : null,
         decision.jevModelVersion ?? null, decision.qualityScore ?? null,
         decision.riscoElevado ?? null, decision.recomendacao,
         decision.tamanhoPosicaoPct, decision.observacao ?? null]
      );
      if (rows?.[0]?.id) return rows[0].id as number;
    }
  } catch (err) {
    console.warn("[AI Studio] Database query failed, using in-memory store:", err);
  }
  const id = mockSignalId++;
  inMemorySignals.set(id, { ativo, timeframe, decision });
  return id;
}

export async function saveTrade(signalId: number, entryPrice: number, exitPrice: number, outcome: "win" | "loss" | "open", profitPercent: number): Promise<void> {
  try {
    if (process.env.DATABASE_URL) {
      await pool.query(
        `INSERT INTO paper_trades (signal_id, entry_price, exit_price, outcome, profit_percent)
         VALUES ($1,$2,$3,$4,$5)`,
        [signalId, entryPrice, exitPrice, outcome, profitPercent]
      );
      return;
    }
  } catch (err) {
    console.warn("[AI Studio] Database query failed, using in-memory store:", err);
  }
  inMemoryTrades.set(signalId, { signalId, entryPrice, exitPrice, outcome, profitPercent });
}

export async function getMetricsByOrigem(): Promise<{ origem: string; total: number; win_rate: number; profit_factor: number }[]> {
  try {
    if (process.env.DATABASE_URL) {
      const { rows } = await pool.query(`
        SELECT s.origem, COUNT(*) AS total,
          ROUND(AVG(CASE WHEN t.outcome = 'win' THEN 1.0 ELSE 0.0 END) * 100, 1) AS win_rate,
          ROUND(SUM(CASE WHEN t.profit_percent > 0 THEN t.profit_percent ELSE 0 END) /
            NULLIF(ABS(SUM(CASE WHEN t.profit_percent < 0 THEN t.profit_percent ELSE 0 END)), 0), 2) AS profit_factor
        FROM signals s JOIN paper_trades t ON t.signal_id = s.id
        WHERE t.outcome != 'open' GROUP BY s.origem
      `);
      return rows;
    }
  } catch (err) {
    console.warn("[AI Studio] Database query failed, computing from in-memory store:", err);
  }
  const groups: Record<string, { total: number; wins: number; gains: number; losses: number }> = {};
  for (const trade of inMemoryTrades.values()) {
    if (trade.outcome === "open") continue;
    const sig = inMemorySignals.get(trade.signalId);
    const origem = sig?.decision?.origem ?? "unknown";
    if (!groups[origem]) groups[origem] = { total: 0, wins: 0, gains: 0, losses: 0 };
    groups[origem].total++;
    if (trade.outcome === "win") groups[origem].wins++;
    if (trade.profitPercent > 0) groups[origem].gains += trade.profitPercent;
    if (trade.profitPercent < 0) groups[origem].losses += Math.abs(trade.profitPercent);
  }
  return Object.entries(groups).map(([origem, stats]) => ({
    origem,
    total: stats.total,
    win_rate: stats.total ? Number(((stats.wins / stats.total) * 100).toFixed(1)) : 0,
    profit_factor: stats.losses ? Number((stats.gains / stats.losses).toFixed(2)) : stats.gains > 0 ? 999 : 0,
  }));
}

export async function freezeConfigThresholds(userId: string): Promise<void> {
  try {
    if (process.env.DATABASE_URL) {
      await pool.query(`UPDATE config SET thresholds_congelados_em = now() WHERE user_id = $1`, [userId]);
      return;
    }
  } catch (err) {
    console.warn("[AI Studio] Database query failed:", err);
  }
}

export async function saveMarketData(ativo: string, timeframe: Timeframe, klines: Kline[]): Promise<number> {
  let count = 0;
  try {
    if (process.env.DATABASE_URL) {
      for (const k of klines) {
        await pool.query(
          `INSERT INTO market_data (ativo, timeframe, open_time, open, high, low, close, volume)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (ativo, timeframe, open_time)
           DO UPDATE SET
             open = EXCLUDED.open,
             high = EXCLUDED.high,
             low = EXCLUDED.low,
             close = EXCLUDED.close,
             volume = EXCLUDED.volume`,
          [ativo, timeframe, k.openTime, k.open, k.high, k.low, k.close, k.volume]
        );
        count++;
      }
      return count;
    }
  } catch (err) {
    console.warn("[AI Studio] Database query failed, saving to in-memory store:", err);
  }

  for (const k of klines) {
    const key = `${ativo}:${timeframe}:${k.openTime.getTime()}`;
    inMemoryMarketData.set(key, { ativo, timeframe, ...k });
    count++;
  }
  return count;
}

export async function getMarketData(ativo: string, timeframe: Timeframe, limit = 500): Promise<Kline[]> {
  try {
    if (process.env.DATABASE_URL) {
      const { rows } = await pool.query(
        `SELECT open_time as "openTime", open, high, low, close, volume
         FROM market_data
         WHERE ativo = $1 AND timeframe = $2
         ORDER BY open_time DESC LIMIT $3`,
        [ativo, timeframe, limit]
      );
      return rows
        .map((r: any) => ({
          openTime: new Date(r.openTime),
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume),
        }))
        .reverse();
    }
  } catch (err) {
    console.warn("[AI Studio] Database query failed, reading from in-memory store:", err);
  }

  const list: Kline[] = [];
  for (const item of inMemoryMarketData.values()) {
    if (item.ativo === ativo && item.timeframe === timeframe) {
      list.push({
        openTime: item.openTime,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      });
    }
  }
  list.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  return list.slice(-limit);
}

export { pool };
