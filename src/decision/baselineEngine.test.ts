import { evaluateBaseline } from "./baselineEngine.js";
import type { MarketState } from "../types.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function market(overrides: Partial<MarketState["indicators"]> = {}, price = 100): MarketState {
  return {
    ativo: "BTCUSDT",
    timeframe: "1h",
    timestamp: Date.now(),
    precoAtual: price,
    indicators: {
      vwap: 100,
      ema9: 101,
      ema21: 100,
      rsi: 55,
      atr: 1,
      ...overrides,
    },
    noticiaSentimento: 0,
  };
}

export function runBaselineTests() {
  console.log("=== INÍCIO DOS TESTES DO BASELINE ===");

  {
    process.stdout.write("1. Tendência de alta + RSI abaixo de 70 -> BUY... ");
    const result = evaluateBaseline(market());
    assert(result.origem === "baseline", "origem deve ser baseline");
    assert(result.recomendacao === "BUY", "condição de alta deve gerar BUY");
    assert(result.tamanhoPosicaoPct === 2, "posição válida deve ser 2%");
    console.log("PASS");
  }

  {
    process.stdout.write("2. Tendência de baixa + RSI acima de 30 -> SELL... ");
    const result = evaluateBaseline(market({ ema9: 99, ema21: 100, rsi: 45 }));
    assert(result.recomendacao === "SELL", "condição de baixa deve gerar SELL");
    assert(result.tamanhoPosicaoPct === 2, "posição válida deve ser 2%");
    console.log("PASS");
  }

  {
    process.stdout.write("3. RSI extremo impede entrada... ");
    assert(evaluateBaseline(market({ ema9: 101, ema21: 100, rsi: 70 })).recomendacao === "WAIT", "RSI 70 deve aguardar");
    assert(evaluateBaseline(market({ ema9: 99, ema21: 100, rsi: 30 })).recomendacao === "WAIT", "RSI 30 deve aguardar");
    console.log("PASS");
  }

  {
    process.stdout.write("4. ATR relativo acima de 2% -> WAIT... ");
    const result = evaluateBaseline(market({ atr: 2.01 }, 100));
    assert(result.riscoElevado === true, "ATR relativo deve ser elevado");
    assert(result.recomendacao === "WAIT", "risco elevado deve bloquear");
    assert(result.tamanhoPosicaoPct === 0, "WAIT deve ter posição zero");
    console.log("PASS");
  }

  {
    process.stdout.write("5. Indicador insuficiente -> WAIT... ");
    const result = evaluateBaseline(market({ ema21: null }));
    assert(result.recomendacao === "WAIT", "indicador null deve bloquear");
    assert(result.tamanhoPosicaoPct === 0, "posição deve ser zero");
    console.log("PASS");
  }

  {
    process.stdout.write("6. Preço inválido -> WAIT... ");
    const result = evaluateBaseline(market(), 0);
    assert(result.recomendacao === "WAIT", "preço zero deve bloquear");
    console.log("PASS");
  }

  console.log("=== TESTES DO BASELINE CONCLUÍDOS ===");
}

if (process.argv[1]?.endsWith("baselineEngine.test.ts") || process.argv[1]?.endsWith("baselineEngine.test.js")) {
  runBaselineTests();
}
