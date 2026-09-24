// Faixa 12: Backtest Runner — compara engines sobre o mesmo histórico,
// sem look-ahead, aplicando os mesmos custos (slippage/fee).
import "dotenv/config";
import { fetchKlines } from "../marketdata/binanceClient.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { simulateTrade } from "../papertrading/simulator.js";
import {
  createBacktestRun,
  getBacktestRun,
  getMarketDataRange,
  saveMarketData,
  saveSignal,
  saveTrade,
} from "../db/repository.js";
import { computeDatasetHash } from "../marketdata/dataset.js";
import { freezeThresholds } from "../config/thresholds.js";
import type { MarketState, Timeframe, DecisionResult, Kline } from "../types.js";

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

function getFromRunId(): number | null {
  const index = process.argv.indexOf("--from-run");
  if (index !== -1 && process.argv[index + 1]) {
    const parsed = Number(process.argv[index + 1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
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
  const fromRunId = getFromRunId();

  // OOS começa somente depois de congelar os thresholds.
  if (mode === "oos") {
    freezeThresholds();
  }

  let klines: Kline[];
  if (fromRunId) {
    const runRecord = await getBacktestRun(fromRunId);
    if (!runRecord) {
      throw new Error(`Run ${fromRunId} não encontrado no banco de dados`);
    }
    klines = await getMarketDataRange(
      runRecord.ativo,
      runRecord.timeframe,
      runRecord.periodoInicio,
      runRecord.periodoFim,
    );
    if (klines.length === 0) {
      throw new Error(`Nenhum candle encontrado no market_data para reproduzir o run ${fromRunId}`);
    }
  } else {
    klines = await fetchKlines(ATIVO, TIMEFRAME, 1000);
    await saveMarketData(ATIVO, TIMEFRAME, klines);
  }

  const datasetHash = computeDatasetHash(klines);
  const indicatorsSeries = computeIndicatorsSeries(klines);
  const evaluationStart = mode === "oos"
    ? Math.floor(klines.length * OOS_START_RATIO)
    : 0;
  const runId = await createBacktestRun({
    engine,
    mode,
    ativo: ATIVO,
    timeframe: TIMEFRAME,
    periodoInicio: klines[0].openTime,
    periodoFim: klines[klines.length - 1].openTime,
    oosStartRatio: mode === "oos" ? OOS_START_RATIO : null,
    thresholdsCongeladosEm: mode === "oos" ? new Date() : null,
    candlesTotal: klines.length,
    datasetHash,
  });

  let processed = 0;
  let skippedWarmup = 0;
  let savedTrades = 0;
  let closedTrades = 0;
  let openTrades = 0;

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
      const signalId = await saveSignal(ATIVO, TIMEFRAME, decision, levels, runId);
      await saveTrade(
        signalId,
        trade.entryPrice,
        trade.exitPrice,
        trade.outcome,
        trade.profitPercent,
        { openedAt: signalCandle.openTime },
      );
      if (trade.outcome === "open") {
        openTrades++;
      } else {
        closedTrades++;
      }
      savedTrades++;
    }
    processed++;
  }

  console.log(
    `Backtest concluído (runId=${runId}, modo=${mode}, engine=${engine}). Dataset hash: ${datasetHash} (${klines.length} candles). Candles processados: ${processed}, pulados por aquecimento: ${skippedWarmup}, posições geradas: ${savedTrades}, fechadas: ${closedTrades}, abertas: ${openTrades}.`,
  );
  console.log(`Consulte GET /api/metrics?runId=${runId} para os resultados desta execução.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
