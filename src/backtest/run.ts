// Faixa 12: Backtest Runner — roda Jev e baseline lado a lado sobre o mesmo
// histórico, sem look-ahead, aplicando os mesmos custos (slippage/fee).
// Exige thresholds congelados (freezeThresholds()) antes de rodar em modo OOS.
import "dotenv/config";
import { fetchKlines } from "../marketdata/binanceClient.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { simulateTrade } from "../papertrading/simulator.js";
import { saveSignal, saveTrade } from "../db/repository.js";
import type { MarketState, Timeframe } from "../types.js";

const ATIVO = "BTCUSDT";
const TIMEFRAME: Timeframe = "1h";
const TARGET_PCT = 0.01;
const STOP_PCT = 0.005;
const LOOKAHEAD_CANDLES = 20;

async function run() {
  const mode = process.argv.includes("--oos") ? "oos" : "dev";
  const klines = await fetchKlines(ATIVO, TIMEFRAME, 1000);

  // Série de indicadores calculada progressivamente, sem look-ahead: o
  // indicador no índice i só usa klines[0..i].
  const indicatorsSeries = computeIndicatorsSeries(klines);

  let processed = 0;
  let skippedWarmup = 0;

  for (let i = 0; i < klines.length - 1; i++) {
    const signalCandle = klines[i];
    const indicators = indicatorsSeries[i];
    const future = klines.slice(i + 1, i + 1 + LOOKAHEAD_CANDLES); // forward-only

    // Indicadores ainda em aquecimento (null) — pula, não inventa valor.
    if (
      indicators.ema9 === null ||
      indicators.ema21 === null ||
      indicators.rsi === null ||
      indicators.atr === null ||
      indicators.vwap === null
    ) {
      skippedWarmup++;
      continue;
    }
    if (future.length === 0) continue;

    const market: MarketState = {
      ativo: ATIVO,
      timeframe: TIMEFRAME,
      timestamp: signalCandle.openTime.getTime(),
      precoAtual: signalCandle.close,
      indicators,
      // Backtest histórico: pipeline de sentimento é caro para rodar em massa
      // sobre 1000 velas — em produção, usar sentimento real cacheado por período.
      noticiaSentimento: 0,
    };

    const jevResult = await decideWithJev(market, mode);
    const baselineResult = evaluateBaseline(market);

    for (const decision of [jevResult, baselineResult]) {
      if (decision.recomendacao === "WAIT") continue;
      const signalId = await saveSignal(ATIVO, TIMEFRAME, decision);
      const trade = simulateTrade(decision.recomendacao, signalCandle, future, TARGET_PCT, STOP_PCT);
      await saveTrade(signalId, trade.entryPrice, trade.exitPrice, trade.outcome, trade.profitPercent);
    }
    processed++;
  }

  console.log(
    `Backtest concluído (modo=${mode}). Candles processados: ${processed}, pulados por aquecimento: ${skippedWarmup}.`
  );
  console.log("Consulte GET /api/metrics para o comparativo Jev vs. baseline.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
