import { simulateTrade, EXECUTION_MODEL_VERSION, FEE_PCT, SLIPPAGE_PCT } from "./simulator.js";
import type { Kline } from "../types.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function approx(actual: number, expected: number, epsilon = 0.000001, message = "") {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`ASSERTION FAILED: ${message} expected=${expected} actual=${actual}`);
  }
}

function candle(close: number, high = close, low = close): Kline {
  return {
    openTime: new Date("2026-09-24T00:00:00Z"),
    open: close,
    high,
    low,
    close,
    volume: 100,
  };
}

export function runPaperTradingTests() {
  console.log("=== INÍCIO DOS TESTES DO EXECUTION MODEL ===");

  {
    process.stdout.write("1. BUY atingindo alvo -> WIN... ");
    const result = simulateTrade("BUY", candle(100), [candle(101.2, 101.2, 100.8)], 0.01, 0.02);
    assert(result.outcome === "win", "alvo deve fechar a operação como win");
    assert(result.exitPrice !== null, "win deve ter preço de saída");
    assert(result.profitPercent > 0, "win deve ter lucro líquido positivo");
    assert(result.exitReason === "target", "saída deve registrar target");
    assert(result.feePercent > 0, "fees devem ser registradas");
    assert(result.slippagePercent > 0, "slippage deve ser registrado");
    assert(result.grossProfitPercent > result.profitPercent, "líquido deve descontar custos");
    console.log("PASS");
  }

  {
    process.stdout.write("2. BUY atingindo stop -> LOSS... ");
    const result = simulateTrade("BUY", candle(100), [candle(99, 99.2, 98)], 0.02, 0.01);
    assert(result.outcome === "loss", "stop deve fechar como loss");
    assert(result.exitPrice !== null, "loss deve ter preço de saída");
    assert(result.profitPercent < 0, "loss deve ter prejuízo");
    assert(result.exitReason === "stop", "saída deve registrar stop");
    console.log("PASS");
  }

  {
    process.stdout.write("3. SELL atingindo alvo -> WIN... ");
    const result = simulateTrade("SELL", candle(100), [candle(98.8, 99.2, 98)], 0.01, 0.02);
    assert(result.outcome === "win", "alvo de venda deve fechar como win");
    assert(result.profitPercent > 0, "win de venda deve ter lucro líquido positivo");
    console.log("PASS");
  }

  {
    process.stdout.write("4. SELL atingindo stop -> LOSS... ");
    const result = simulateTrade("SELL", candle(100), [candle(101.5, 102, 101)], 0.01, 0.01);
    assert(result.outcome === "loss", "stop de venda deve fechar como loss");
    assert(result.profitPercent < 0, "loss de venda deve ter prejuízo");
    console.log("PASS");
  }

  {
    process.stdout.write("5. Nenhum nível atingido -> OPEN... ");
    const result = simulateTrade("BUY", candle(100), [candle(100.2, 100.3, 99.9)], 0.05, 0.05);
    assert(result.outcome === "open", "sem alvo/stop deve permanecer aberto");
    assert(result.exitPrice === null, "operação aberta não deve inventar preço de saída");
    assert(result.profitPercent === 0, "operação aberta não deve registrar lucro realizado");
    assert(result.exitReason === "end", "operação aberta termina com exitReason=end");
    console.log("PASS");
  }

  {
    process.stdout.write("6. Alvo e stop no mesmo candle -> STOP primeiro... ");
    const result = simulateTrade("BUY", candle(100), [candle(100, 102, 98)], 0.01, 0.01);
    assert(result.outcome === "loss", "ambiguidade intrabar deve ser tratada conservadoramente");
    assert(result.exitReason === "stop", "stop deve ter prioridade");
    console.log("PASS");
  }

  {
    process.stdout.write("7. Custos padrão são explícitos... ");
    assert(EXECUTION_MODEL_VERSION === "v2", "versão do modelo de execução deve ser v2");
    assert(FEE_PCT === 0.001, "fee padrão deve ser 0,1% por lado");
    assert(SLIPPAGE_PCT === 0.0005, "slippage padrão deve ser 0,05% por lado");
    console.log("PASS");
  }

  {
    process.stdout.write("8. Parâmetros inválidos devem falhar... ");
    let failed = false;
    try {
      simulateTrade("BUY", candle(100), [], 0, 0.01);
    } catch {
      failed = true;
    }
    assert(failed, "target zero deve lançar erro");
    console.log("PASS");
  }

  console.log("=== TESTES DO EXECUTION MODEL CONCLUÍDOS ===");
}

if (process.argv[1]?.endsWith("simulator.test.ts") || process.argv[1]?.endsWith("simulator.test.js")) {
  runPaperTradingTests();
}
