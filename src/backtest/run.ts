// Faixa 12: Backtest Runner — compara engines sobre o mesmo histórico,
// sem look-ahead, aplicando os mesmos custos (slippage/fee).
import "dotenv/config";
import { fetchKlines } from "../marketdata/binanceClient.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { simulateTrade } from "../papertrading/simulator.js";
import { saveSignal, saveTrade } from "../db/repository.js";
import { freezeThresholds } from "../config/thresholds.js";
import type { MarketState, Timeframe, DecisionResult } from "../types.js";

const ATIVO = "BTCUSDT";
const TIMEFRAME: Timeframe = "1h";
const TARGET_PCT = 0.01;
const STOP_PCT = 0.005;
const LOOKAHEAD_CANDLES = 20;
const OOS_START_RATIO = 0.7;

type Engine = "both" | "baseline" | "jev";

function getEngine(): Engine {
  if (process.argv.includes("--baseline-only")) return "baseline";
  if (process.argv.includes("--jev-only")) return "jev";
  return "both";
}

function getLevels(entryPrice: number, side: "BUY" | "SELL") {
  const direction = side === "BUY" ? 1 : -1;
  return {
    entrada: entryPrice,
    alvo: entryPrice * (1 + direction * TARGET_PCT),
    stop: entryPrice * (1 - direction * STOP_PCT),
  };
}

async function run() {
  const mode = process.argv.includes("--oos") ? "oos" : "dev";
  const engine = getEngine();

  // OOS começa somente depois de congelar os thresholds.
  if (mode === "oos") {
    freezeThresholds();
  }

  const klines = await fetchKlines(ATIVO, TIMEFRAME, 1000);
  const indicatorsSeries = computeIndicatorsSeries(klines);
  const evaluationStart = mode === "oos"
    ? Math.floor(klines.length * OOS_START_RATIO)
    : 0;

  let processed = 0;
  let skippedWarmup = 0;
  let savedTrades = 0;

  for (let i = evaluationStart; i < klines.length - 1; i++) {
    const signalCandle = klines[i];
    const indicators = indicatorsSeries[i];
    const future = klines.slice(i + 1, i + 1 + LOOKAHEAD_CANDLES);

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
      noticiaSentimento: 0,
    };

    const decisions: DecisionResult[] = [];
    if (engine === "both" || engine === "jev") {
      decisions.push(await decideWithJev(market, mode));
    }
    if (engine === "both" || engine === "baseline") {
      decisions.push(evaluateBaseline(market));
    }

    for (const decision of decisions) {
      if (decision.recomendacao === "WAIT") continue;

      const trade = simulateTrade(
        decision.recomendacao,
        signalCandle,
        future,
        TARGET_PCT,
        STOP_PCT,
      );
      const levels = getLevels(trade.entryPrice, decision.recomendacao);
      const signalId = await saveSignal(ATIVO, TIMEFRAME, decision, levels);
      await saveTrade(
        signalId,
        trade.entryPrice,
        trade.exitPrice,
        trade.outcome,
        trade.profitPercent,
        { openedAt: signalCandle.openTime },
      );
      savedTrades++;
    }
    processed++;
  }

  console.log(
    `Backtest concluído (modo=${mode}, engine=${engine}). Candles processados: ${processed}, pulados por aquecimento: ${skippedWarmup}, trades salvos: ${savedTrades}.`,
  );
  console.log("Consulte GET /api/metrics para o comparativo Jev vs. baseline.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
