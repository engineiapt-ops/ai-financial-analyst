import pg from "pg";
import type { DecisionResult, Timeframe } from "../types.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function saveSignal(ativo: string, timeframe: Timeframe, decision: DecisionResult): Promise<number> {
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
  return rows[0].id as number;
}

export async function saveTrade(signalId: number, entryPrice: number, exitPrice: number, outcome: "win" | "loss" | "open", profitPercent: number): Promise<void> {
  await pool.query(
    `INSERT INTO paper_trades (signal_id, entry_price, exit_price, outcome, profit_percent)
     VALUES ($1,$2,$3,$4,$5)`,
    [signalId, entryPrice, exitPrice, outcome, profitPercent]
  );
}

export async function getMetricsByOrigem(): Promise<{ origem: string; total: number; win_rate: number; profit_factor: number }[]> {
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

export async function freezeConfigThresholds(userId: string): Promise<void> {
  await pool.query(`UPDATE config SET thresholds_congelados_em = now() WHERE user_id = $1`, [userId]);
}
export { pool };
