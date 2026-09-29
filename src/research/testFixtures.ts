import type { AnalyzeOutput } from "../api/analyze.js";

export function buildTestAnalyzeOutput(): AnalyzeOutput {
  return {
    signalId: 1,
    decisionLogId: 2,
    market: {
      ativo: "BTCUSDT",
      timeframe: "1h",
      timestamp: Date.parse("2026-09-26T11:00:00.000Z"),
      dataAsOf: Date.parse("2026-09-26T11:00:00.000Z"),
      precoAtual: 100000,
      indicators: {
        vwap: 99900,
        ema9: 100100,
        ema21: 99800,
        rsi: 58,
        atr: 1200,
      },
      noticiaSentimento: 0,
    },
    decision: {
      origem: "baseline",
      recomendacao: "BUY",
      tamanhoPosicaoPct: 2,
      confidence: 0.7,
      riscoElevado: false,
      observacao: "risk=risk_ok regime=normal",
    },
    valorInvestimento: 1000,
    valorExposto: 20,
    candlesAnalisados: 100,
    marketDataQuality: {
      version: "market-data-quality.v1",
      status: "fresh",
      timeframe: "1h",
      checkedAt: "2026-09-26T11:30:00.000Z",
      dataAsOf: "2026-09-26T11:00:00.000Z",
      ageMs: 30 * 60 * 1000,
      maxAgeMs: 90 * 60 * 1000,
    },
    risk: {
      version: "risk-engine-v2",
      allowed: true,
      positionSizePct: 2,
      maxGrossExposurePct: 20,
      reason: "risk_ok",
      regime: {
        key: "normal",
        volatility: "NORMAL",
      } as any,
    },
  };
}
