import { strict as assert } from "node:assert";
import { analyzeMarket } from "./analyze.js";
import type { AnalyzeMarketDependencies } from "./analyze.js";
import type { Kline } from "../domain/trading.js";
import type { RiskState } from "../risk/riskEngine.js";

function makeCandles(): Kline[] {
  const lastCloseTime = Date.now() - 2 * 60 * 1000;
  return Array.from({ length: 100 }, (_, index) => {
    const closeTime = new Date(
      lastCloseTime - (99 - index) * 60 * 60 * 1000,
    );
    const openTime = new Date(closeTime.getTime() - 60 * 60 * 1000 + 1);
    const close = 100 + index * 0.1;
    return {
      openTime,
      closeTime,
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + index,
    };
  });
}

const candles = makeCandles();
const baseDecision = {
  origem: "baseline" as const,
  recomendacao: "BUY" as const,
  tamanhoPosicaoPct: 1.5,
  riscoElevado: false,
  confidence: 0.9,
  probabilidadeDirecional: 0.8,
};

function makeDependencies(
  riskState: RiskState,
): Partial<AnalyzeMarketDependencies> {
  return {
    getMarketData: async () => candles,
    getSentiment: async () => 0,
    evaluateBaseline: () => baseDecision,
    createRiskState: () => riskState,
    saveSignal: async (
      _ativo,
      _timeframe,
      _decision,
      _levels,
    ) => 501,
    saveDecisionLog: async () => 601,
    saveMarketData: async () => candles.length,
  };
}

const allowed = await analyzeMarket(
  {
    ativo: "BTCUSDT",
    timeframe: "1h",
    valorInvestimento: 1000,
    engine: "baseline",
    news: false,
  },
  makeDependencies({
    equity: 1000,
    dailyLossPct: 0,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  }),
);

assert.equal(allowed.risk.version, "risk-engine-v2");
assert.equal(allowed.risk.allowed, true);
assert.equal(allowed.decision.recomendacao, "BUY");
assert.equal(allowed.decision.tamanhoPosicaoPct, 1.5);
assert.equal(allowed.valorExposto, 15);
assert.equal(allowed.signalId, 501);
assert.equal(allowed.decisionLogId, 601);

const blocked = await analyzeMarket(
  {
    ativo: "BTCUSDT",
    timeframe: "1h",
    valorInvestimento: 1000,
    engine: "baseline",
    news: false,
  },
  makeDependencies({
    equity: 1000,
    dailyLossPct: 2,
    tradesToday: 0,
    openPositions: 0,
    grossExposurePct: 0,
    consecutiveLosses: 0,
  }),
);

assert.equal(blocked.risk.version, "risk-engine-v2");
assert.equal(blocked.risk.allowed, false);
assert.equal(blocked.risk.reason, "daily_loss_limit");
assert.equal(blocked.decision.recomendacao, "WAIT");
assert.equal(blocked.decision.tamanhoPosicaoPct, 0);
assert.equal(blocked.valorExposto, 0);

console.log("analyze Risk V2 integration tests passed");
