import {
  typicalPrice,
  vwap,
  vwapSeries,
  ema,
  emaLatest,
  rsi,
  rsiSeries,
  trueRange,
  atr,
  atrSeries,
  computeIndicators,
  computeIndicatorsSeries,
  MIN_DATA_POINTS,
} from "./indicators.js";
import { decideBaseline } from "../decision/baselineEngine.js";
import type { Kline, MarketState } from "../types.js";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

function assertCloseTo(actual: number | null, expected: number, epsilon = 0.0001, msg = "") {
  if (actual === null) {
    throw new Error(`ASSERTION FAILED: ${msg} (Esperado número ${expected}, mas recebeu null)`);
  }
  const diff = Math.abs(actual - expected);
  if (diff > epsilon) {
    throw new Error(`ASSERTION FAILED: ${msg} (Esperado: ${expected}, Obtido: ${actual}, Diff: ${diff})`);
  }
}

function createDummyKline(
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  timeMs = 1700000000000
): Kline {
  return {
    openTime: new Date(timeMs),
    open,
    high,
    low,
    close,
    volume,
    closeTime: new Date(timeMs + 3600000),
  };
}

export function runFeatureEngineTests() {
  console.log("=== INÍCIO DOS TESTES DO FEATURE ENGINE (FAIXA 04) ===\n");

  // 1. Constantes de Dados Mínimos
  {
    process.stdout.write("1. Verificando constantes de dados mínimos... ");
    assert(MIN_DATA_POINTS.VWAP === 1, "VWAP mínimo 1");
    assert(MIN_DATA_POINTS.EMA9 === 9, "EMA9 mínimo 9");
    assert(MIN_DATA_POINTS.EMA21 === 21, "EMA21 mínimo 21");
    assert(MIN_DATA_POINTS.RSI14 === 15, "RSI14 mínimo 15");
    assert(MIN_DATA_POINTS.ATR14 === 15, "ATR14 mínimo 15");
    console.log("PASS");
  }

  // 2. Preço Típico
  {
    process.stdout.write("2. Testando typicalPrice... ");
    const k = createDummyKline(10, 15, 5, 10, 100);
    const tp = typicalPrice(k);
    assertCloseTo(tp, 10, 0.0001, "Typical price de (15+5+10)/3 deve ser 10");
    console.log("PASS (TP = 10)");
  }

  // 3. VWAP
  {
    process.stdout.write("3. Testando VWAP (cálculo ponderado e casos de borda)... ");
    // Cálculo ponderado
    const k1 = createDummyKline(10, 12, 8, 10, 100); // TP = 10, PV = 1000
    const k2 = createDummyKline(20, 22, 18, 20, 200); // TP = 20, PV = 4000
    const val = vwap([k1, k2]);
    assertCloseTo(val, 16.666666, 0.0001, "VWAP ponderado de 2 candles");

    // Array vazio -> retorna null (não inventa dados)
    assert(vwap([]) === null, "VWAP de array vazio deve retornar null");

    // Volume zero -> fallback para último close
    const zeroVol = [createDummyKline(100, 110, 90, 105, 0)];
    assertCloseTo(vwap(zeroVol), 105, 0.0001, "VWAP com volume zero retorna último close");
    console.log("PASS");
  }

  // 4. EMA 9 e EMA 21: Requisito Mínimo e Retorno de null
  {
    process.stdout.write("4. Testando EMA 9 e EMA 21 (null para dados insuficientes e semente SMA)... ");
    // Menos de 9 elementos -> null
    for (let count = 1; count < 9; count++) {
      const prices = new Array(count).fill(100);
      assert(emaLatest(prices, 9) === null, `EMA 9 com ${count} elementos deve ser null`);
    }

    // Exatamente 9 elementos [10, 20, ..., 90] -> semente deve ser a SMA = 50
    const ninePrices = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const ema9Val = emaLatest(ninePrices, 9);
    assertCloseTo(ema9Val, 50, 0.0001, "EMA 9 com 9 elementos deve ser a média simples dos 9");

    // Série EMA 9: primeiros 8 elementos devem ser null
    const series9 = ema(ninePrices, 9);
    assert(series9.length === 9, "Tamanho de series9");
    for (let i = 0; i < 8; i++) {
      assert(series9[i] === null, `series9[${i}] deve ser null`);
    }
    assertCloseTo(series9[8], 50, 0.0001, "series9[8] deve ser 50");

    // EMA 21: menos de 21 elementos deve retornar null
    const twentyPrices = new Array(20).fill(100);
    assert(emaLatest(twentyPrices, 21) === null, "EMA 21 com 20 elementos deve ser null");

    const twentyOnePrices = new Array(21).fill(100);
    assertCloseTo(emaLatest(twentyOnePrices, 21), 100, 0.0001, "EMA 21 com 21 elementos iguais a 100 deve ser 100");
    console.log("PASS");
  }

  // 5. RSI (14): Requisito Mínimo estrito e Metodologia Wilder
  {
    process.stdout.write("5. Testando RSI (14) (null para < 15 preços e metodologia Wilder)... ");
    // Teste de dados insuficientes: 1 até 14 preços DEVEM retornar null (NUNCA 50 ou 0)
    for (let count = 1; count <= 14; count++) {
      const closes = new Array(count).fill(100);
      assert(rsi(closes, 14) === null, `RSI 14 com ${count} preços deve ser null`);
      const s = rsiSeries(closes, 14);
      assert(s[s.length - 1] === null, `rsiSeries com ${count} preços deve terminar em null`);
    }

    // Com 15 preços idênticos -> sem variação -> 50
    const flat15 = new Array(15).fill(100);
    assertCloseTo(rsi(flat15, 14), 50, 0.0001, "RSI com 15 preços planos deve ser 50");

    // Com 15 preços estritamente crescentes -> todas as 14 variações são positivas -> RSI 100
    const strictlyIncreasing = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    assertCloseTo(rsi(strictlyIncreasing, 14), 100, 0.0001, "RSI com 14 altas consecutivas deve ser 100");

    // Com 15 preços estritamente decrescentes -> todas as 14 variações são negativas -> RSI 0
    const strictlyDecreasing = [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    assertCloseTo(rsi(strictlyDecreasing, 14), 0, 0.0001, "RSI com 14 quedas consecutivas deve ser 0");

    // Teste de suavização de Wilder no 16º candle:
    // 14 variações iniciais de +1 -> avgGain_0 = 1, avgLoss_0 = 0
    // 15ª variação (índice 15) de -1 -> currentGain = 0, currentLoss = 1
    // avgGain_1 = (1 * 13 + 0) / 14 = 13/14 = 0.92857
    // avgLoss_1 = (0 * 13 + 1) / 14 = 1/14 = 0.071428
    // RS = (13/14) / (1/14) = 13
    // RSI = 100 - (100 / 14) = 100 - 7.142857 = 92.85714
    const sequence16 = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, // 14 altas de +1
      13, // 1 queda de -1
    ];
    const rsi16 = rsi(sequence16, 14);
    assertCloseTo(rsi16, 92.85714, 0.001, "Suavização de Wilder do RSI com 16 preços");
    console.log(`PASS (RSI16 = ${rsi16?.toFixed(4)})`);
  }

  // 6. ATR (14): Requisito Mínimo estrito e Metodologia Wilder
  {
    process.stdout.write("6. Testando ATR (14) (null para < 15 candles e metodologia Wilder)... ");
    // Teste de dados insuficientes: 1 até 14 candles DEVEM retornar null (NUNCA 0)
    for (let count = 1; count <= 14; count++) {
      const candles: Kline[] = [];
      for (let i = 0; i < count; i++) {
        candles.push(createDummyKline(100, 105, 95, 100, 100));
      }
      assert(atr(candles, 14) === null, `ATR 14 com ${count} candles deve ser null`);
      const s = atrSeries(candles, 14);
      assert(s[s.length - 1] === null, `atrSeries com ${count} candles deve terminar em null`);
    }

    // Com 15 candles idênticos com H-L = 10 e sem gaps (TR = 10)
    const candles15: Kline[] = [];
    for (let i = 0; i < 15; i++) {
      candles15.push(createDummyKline(100, 105, 95, 100, 100));
    }
    assertCloseTo(atr(candles15, 14), 10, 0.0001, "ATR de 15 candles com TR fixo 10");

    // Teste de suavização de Wilder no 16º candle:
    // 14 TRs iniciais de 10 -> ATR_0 = 10
    // 15º TR (candle 15): H=120, L=96, C=100 (H-L = 24, TR = 24)
    // ATR_1 = (10 * 13 + 24) / 14 = (130 + 24) / 14 = 154 / 14 = 11.0
    const candles16 = [...candles15, createDummyKline(100, 120, 96, 100, 100)];
    const atr16 = atr(candles16, 14);
    assertCloseTo(atr16, 11.0, 0.0001, "Suavização de Wilder do ATR no 16º candle deve ser 11.0");
    console.log(`PASS (ATR16 = ${atr16?.toFixed(4)})`);
  }

  // 7. computeIndicators com Dados Insuficientes e Aquecidos
  {
    process.stdout.write("7. Testando computeIndicators consolidado (insuficiente vs aquecido)... ");
    // Com 5 candles: VWAP é número, mas todos os demais DEVEM ser null
    const fiveCandles: Kline[] = [];
    for (let i = 0; i < 5; i++) {
      fiveCandles.push(createDummyKline(100, 105, 95, 100, 100));
    }
    const ind5 = computeIndicators(fiveCandles);
    assert(typeof ind5.vwap === "number", "vwap com 5 candles deve ser número");
    assert(ind5.ema9 === null, "ema9 com 5 candles deve ser null");
    assert(ind5.ema21 === null, "ema21 com 5 candles deve ser null");
    assert(ind5.rsi === null, "rsi com 5 candles deve ser null");
    assert(ind5.atr === null, "atr com 5 candles deve ser null");

    // Com 30 candles: todos os 5 indicadores DEVEM ser números válidos
    const thirtyCandles: Kline[] = [];
    let price = 80000;
    for (let i = 0; i < 30; i++) {
      price += (i % 2 === 0 ? 50 : -30);
      thirtyCandles.push(createDummyKline(price - 10, price + 20, price - 20, price, 100));
    }
    const ind30 = computeIndicators(thirtyCandles);
    assert(typeof ind30.vwap === "number" && !isNaN(ind30.vwap), "vwap30 válido");
    assert(typeof ind30.ema9 === "number" && !isNaN(ind30.ema9), "ema930 válido");
    assert(typeof ind30.ema21 === "number" && !isNaN(ind30.ema21), "ema2130 válido");
    assert(typeof ind30.rsi === "number" && !isNaN(ind30.rsi), "rsi30 válido");
    assert(typeof ind30.atr === "number" && !isNaN(ind30.atr), "atr30 válido");
    console.log("PASS");
  }

  // 8. Resiliência do motor de decisão com indicadores null
  {
    process.stdout.write("8. Testando resiliência de decideBaseline com indicadores null... ");
    const partialMarket: MarketState = {
      ativo: "BTCUSDT",
      timeframe: "1h",
      timestamp: Date.now(),
      precoAtual: 84000,
      indicators: {
        vwap: 84000,
        ema9: null,
        ema21: null,
        rsi: null,
        atr: null,
      },
      noticiaSentimento: 0,
    };
    const decision = decideBaseline(partialMarket);
    assert(decision.recomendacao === "WAIT", "Recomendação com dados insuficientes deve ser WAIT");
    assert(decision.tamanhoPosicaoPct === 0, "Tamanho de posição deve ser 0");
    assert(
      decision.observacao?.includes("insuficientes") === true,
      "Observação deve informar indicadores insuficientes"
    );
    console.log("PASS");
  }

  // 9. computeIndicatorsSeries (sem lookahead bias e preservando nulls na janela de aquecimento)
  {
    process.stdout.write("9. Testando computeIndicatorsSeries progressivo... ");
    const candles: Kline[] = [];
    for (let i = 0; i < 25; i++) {
      candles.push(createDummyKline(100 + i, 105 + i, 95 + i, 102 + i, 50));
    }
    const series = computeIndicatorsSeries(candles);
    assert(series.length === 25, "Comprimento da série");
    // No candle 5 (índice 4): ema9, ema21, rsi, atr são null
    assert(series[4].ema9 === null, "Série candle 5 ema9 null");
    assert(series[4].rsi === null, "Série candle 5 rsi null");
    // No candle 10 (índice 9): ema9 é number, mas ema21 e rsi ainda são null
    assert(typeof series[9].ema9 === "number", "Série candle 10 ema9 number");
    assert(series[9].ema21 === null, "Série candle 10 ema21 null");
    // No candle 15 (índice 14): rsi e atr tornam-se number
    assert(typeof series[14].rsi === "number", "Série candle 15 rsi number");
    assert(typeof series[14].atr === "number", "Série candle 15 atr number");
    // No candle 22 (índice 21): ema21 torna-se number
    assert(typeof series[21].ema21 === "number", "Série candle 22 ema21 number");
    console.log("PASS");
  }

  console.log("\n=== TESTES DO FEATURE ENGINE CONCLUÍDOS COM 100% DE SUCESSO ===");
}

if (process.argv[1]?.endsWith("indicators.test.ts") || process.argv[1]?.endsWith("indicators.test.js")) {
  runFeatureEngineTests();
}
