import { fetchKlines } from "../marketdata/binanceClient.js";
import { computeIndicators } from "../features/indicators.js";
import { GdeltSource, getSentiment } from "../features/sentimentPipeline.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { saveDecisionLog, saveMarketData, saveSignal } from "../db/repository.js";
import { filterKlinesByAsOf } from "../marketdata/pointInTime.js";
import { calibrateRegimeThresholds, classifyRegime } from "../risk/regime.js";
import { applyRiskToDecision, evaluateRisk } from "../risk/riskEngine.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import type { MarketState, Timeframe, DecisionResult } from "../types.js";

export interface AnalyzeInput {
  ativo: string;
  timeframe: Timeframe;
  valorInvestimento: number;
  engine: "baseline" | "jev";
  news: boolean;
}

export interface AnalyzeOutput {
  signalId: number;
  decisionLogId: number;
  market: MarketState;
  decision: DecisionResult;
  valorInvestimento: number;
  valorExposto: number;
  candlesAnalisados: number;
  risk: ReturnType<typeof evaluateRisk>;
}

export async function analyzeMarket(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const ativo = input.ativo.trim().toUpperCase();
  if (!ativo) throw new Error("ativo is required");
  if (!Number.isFinite(input.valorInvestimento) || input.valorInvestimento <= 0) {
    throw new Error("valorInvestimento must be greater than zero");
  }

  const now = new Date();
  const klines = filterKlinesByAsOf(
    await fetchKlines(ativo, input.timeframe, 100),
    now,
  );
  if (klines.length < 21) {
    throw new Error("Insufficient closed market candles for EMA21");
  }

  const last = klines[klines.length - 1];
  const dataAsOf = last.closeTime ?? last.openTime;
  const indicators = computeIndicators(klines);
  const noticiaSentimento = input.news
    ? await getSentiment(ativo, [new GdeltSource()], dataAsOf)
    : 0;

  const market: MarketState = {
    ativo,
    timeframe: input.timeframe,
    timestamp: dataAsOf.getTime(),
    dataAsOf: dataAsOf.getTime(),
    precoAtual: last.close,
    indicators,
    noticiaSentimento,
  };

  const rawDecision =
    input.engine === "jev"
      ? await decideWithJev(market)
      : evaluateBaseline(market);

  // Risk calibration uses only candles strictly before the decision candle.
  const calibrationCandles = Math.max(30, klines.length - 1);
  const regimeThresholds = calibrateRegimeThresholds(
    klines,
    calibrationCandles,
    new Date(dataAsOf.getTime()),
  );
  const indicatorsSeries = computeIndicatorsSeries(klines);
  const regime = classifyRegime(last, indicatorsSeries[indicatorsSeries.length - 1], regimeThresholds);
  const risk = evaluateRisk(rawDecision, regime);
  const decision = applyRiskToDecision(rawDecision, risk);

  const valorExposto =
    input.valorInvestimento * (decision.tamanhoPosicaoPct / 100);

  const signalId = await saveSignal(ativo, input.timeframe, decision, {
    entrada: decision.recomendacao === "WAIT" ? null : last.close,
  });

  const decisionLogId = await saveDecisionLog({
    ativo,
    timeframe: input.timeframe,
    decisionAt: new Date(),
    dataAsOf,
    decision,
    referencePrice: last.close,
  });

  await saveMarketData(ativo, input.timeframe, klines);

  return {
    signalId,
    decisionLogId,
    market,
    decision,
    valorInvestimento: input.valorInvestimento,
    valorExposto,
    candlesAnalisados: klines.length,
    risk,
  };
}
