import { fetchKlines } from "../marketdata/binanceClient.js";
import { computeIndicators } from "../features/indicators.js";
import { GdeltSource, getSentiment } from "../features/sentimentPipeline.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import { saveMarketData, saveSignal } from "../db/repository.js";
import { filterKlinesByAsOf } from "../marketdata/pointInTime.js";
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
  market: MarketState;
  decision: DecisionResult;
  valorInvestimento: number;
  valorExposto: number;
  candlesAnalisados: number;
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

  const decision =
    input.engine === "jev"
      ? await decideWithJev(market)
      : evaluateBaseline(market);

  const valorExposto =
    input.valorInvestimento * (decision.tamanhoPosicaoPct / 100);

  const signalId = await saveSignal(ativo, input.timeframe, decision, {
    entrada: decision.recomendacao === "WAIT" ? null : last.close,
  });

  await saveMarketData(ativo, input.timeframe, klines);

  return {
    signalId,
    market,
    decision,
    valorInvestimento: input.valorInvestimento,
    valorExposto,
    candlesAnalisados: klines.length,
  };
}
