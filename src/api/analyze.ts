import { createDefaultMarketDataService } from "../marketdata/defaultService.js";
import { computeIndicators } from "../features/indicators.js";
import { GdeltSource, getSentiment } from "../features/sentimentPipeline.js";
import { evaluateBaseline } from "../decision/baselineEngine.js";
import { decideWithJev } from "../decision/decisionEngine.js";
import type { AnalysisPersistenceRepository } from "../db/ports/analysisPersistenceRepository.js";
import { getDefaultAnalysisPersistenceRepository } from "../db/repositories/analysisPersistenceRepository.js";
import { calibrateRegimeThresholds, classifyRegime } from "../risk/regime.js";
import { applyRiskToDecision, evaluateRisk } from "../risk/riskEngine.js";
import { computeIndicatorsSeries } from "../features/indicators.js";
import { assertMarketDataFresh, type MarketDataQuality } from "../marketdata/quality.js";
import { getInstrument } from "../instruments/registry.js";
import { buildExecutableSignal } from "../signals/executableSignal.js";
import type { Kline, MarketState, Timeframe, DecisionResult } from "../types.js";

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
  marketDataQuality: MarketDataQuality;
  risk: ReturnType<typeof evaluateRisk>;
}

export interface AnalyzeMarketDependencies {
  getMarketData: (ativo: string, timeframe: Timeframe, limit: number, checkedAt: Date) => Promise<Kline[]>;
  getSentiment: typeof getSentiment;
  evaluateBaseline: typeof evaluateBaseline;
  decideWithJev: typeof decideWithJev;
  saveSignal: AnalysisPersistenceRepository["saveSignal"];
  saveDecisionLog: AnalysisPersistenceRepository["saveDecisionLog"];
  saveMarketData: AnalysisPersistenceRepository["saveMarketData"];
}

const defaultMarketDataService = createDefaultMarketDataService();
const defaultAnalysisPersistenceRepository = getDefaultAnalysisPersistenceRepository();

const DEFAULT_DEPENDENCIES: AnalyzeMarketDependencies = {
  getMarketData: async (ativo, timeframe, limit, checkedAt) =>
    (await defaultMarketDataService.getSnapshot({
      provider: "binance",
      instrument: ativo,
      timeframe,
      limit,
      endTime: checkedAt.getTime(),
    }, checkedAt)).candles,
  getSentiment,
  evaluateBaseline,
  decideWithJev,
  saveSignal: defaultAnalysisPersistenceRepository.saveSignal,
  saveDecisionLog: defaultAnalysisPersistenceRepository.saveDecisionLog,
  saveMarketData: defaultAnalysisPersistenceRepository.saveMarketData,
};

function blockDecisionForExecution(
  decision: DecisionResult,
  reason: "invalid_price" | "cost_filter",
): DecisionResult {
  return {
    ...decision,
    recomendacao: "WAIT",
    tamanhoPosicaoPct: 0,
    riscoElevado: decision.recomendacao !== "WAIT" || Boolean(decision.riscoElevado),
    observacao: [
      decision.observacao,
      `execution=blocked reason=${reason}`,
    ].filter(Boolean).join(" "),
  };
}

export async function analyzeMarket(
  input: AnalyzeInput,
  dependencies: Partial<AnalyzeMarketDependencies> = {},
): Promise<AnalyzeOutput> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const ativo = input.ativo.trim().toUpperCase();
  if (!ativo) throw new Error("ativo is required");

  const instrument = getInstrument(ativo);
  if (!instrument.enabled) {
    throw new Error("Instrument is disabled");
  }

  if (!Number.isFinite(input.valorInvestimento) || input.valorInvestimento <= 0) {
    throw new Error("valorInvestimento must be greater than zero");
  }

  const now = new Date();
  const klines = await deps.getMarketData(ativo, input.timeframe, 100, now);
  if (klines.length < 21) {
    throw new Error("Insufficient closed market candles for EMA21");
  }

  const marketDataQuality = assertMarketDataFresh({
    timeframe: input.timeframe,
    candles: klines,
    checkedAt: now,
  });

  const last = klines[klines.length - 1];
  const dataAsOf = last.closeTime ?? last.openTime;
  const indicators = computeIndicators(klines);
  const noticiaSentimento = input.news
    ? await deps.getSentiment(ativo, [new GdeltSource()], dataAsOf)
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
      ? await deps.decideWithJev(market)
      : deps.evaluateBaseline(market);

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
  const riskAdjustedDecision = applyRiskToDecision(rawDecision, risk);
  const execution = buildExecutableSignal({
    ativo,
    timeframe: input.timeframe,
    dataAsOf,
    decision: riskAdjustedDecision,
    entryPrice: last.close,
    atr: indicators.atr,
  });

  let decision = riskAdjustedDecision;
  if (execution.status === "not_executable") {
    if (execution.reason === "cost_filter" || execution.reason === "invalid_price") {
      decision = blockDecisionForExecution(riskAdjustedDecision, execution.reason);
    }
  }

  const valorExposto =
    input.valorInvestimento * (decision.tamanhoPosicaoPct / 100);

  const signalId = await deps.saveSignal(ativo, input.timeframe, decision, {
    entrada: execution.status === "ready" ? execution.entrada : null,
    alvo: execution.status === "ready" ? execution.alvo : null,
    stop: execution.status === "ready" ? execution.stop : null,
  });

  const decisionLogId = await deps.saveDecisionLog({
    ativo,
    timeframe: input.timeframe,
    decisionAt: new Date(),
    dataAsOf,
    decision,
    referencePrice: last.close,
  });

  await deps.saveMarketData(ativo, input.timeframe, klines);

  return {
    signalId,
    decisionLogId,
    market,
    decision,
    valorInvestimento: input.valorInvestimento,
    valorExposto,
    candlesAnalisados: klines.length,
    marketDataQuality,
    risk,
  };
}
