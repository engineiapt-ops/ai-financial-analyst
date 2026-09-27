import { simulateWalkForwardPortfolio } from "./walkForwardEngine.js";
import type { Kline } from "../types.js";
import type { TradeOutcome } from "../papertrading/simulator.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function approx(actual: number, expected: number, epsilon = 0.000001, message = "") {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(
      `ASSERTION FAILED: ${message} expected=${expected} actual=${actual}`,
    );
  }
}

function candle(close: number, hour: number, high = close, low = close): Kline {
  return {
    openTime: new Date(`2026-09-24T${String(hour).padStart(2, "0")}:00:00Z`),
    closeTime: new Date(`2026-09-24T${String(hour).padStart(2, "0")}:59:59.999Z`),
    open: close,
    high,
    low,
    close,
    volume: 100,
  };
}

function closedOutcome(
  entryPrice: number,
  exitPrice: number,
  profitPercent: number,
  grossProfitPercent: number,
  feePercent: number,
  slippagePercent: number,
): TradeOutcome {
  return {
    signalPrice: entryPrice,
    entryPrice,
    exitPrice,
    outcome: profitPercent >= 0 ? "win" : "loss",
    profitPercent,
    grossProfitPercent,
    feePercent,
    slippagePercent,
    candlesHeld: 1,
    exitReason: "target",
    targetPrice: exitPrice,
    stopPrice: entryPrice,
    maxFavorableExcursionPct: 0,
    maxAdverseExcursionPct: 0,
  };
}

export function runWalkForwardPortfolioTests() {
  console.log("=== INÍCIO DOS TESTES DO WALK-FORWARD PORTFOLIO ===");

  {
    process.stdout.write("1. Capital finito + limite de exposição... ");
    const klines = [
      candle(100, 0),
      candle(100, 1),
      candle(100, 2),
    ];
    const trades = Array.from({ length: 20 }, (_, id) => ({
      id,
      signalIndex: 0,
      exitIndex: 1,
      side: "BUY" as const,
      outcome: closedOutcome(100, 100, -0.3, 0, 0.2, 0.1),
    }));

    const result = simulateWalkForwardPortfolio({
      klines,
      trades,
      totalSignals: trades.length,
      initialCapital: 1000,
      positionSizePct: 2,
      maxGrossExposurePct: 20,
    });

    assert(result.executedTrades === 9, "o limite de exposição deve aceitar apenas as posições que cabem no capital");
    assert(
      result.maxGrossExposure <= 200.000001,
      "exposição bruta não pode ultrapassar 20% do capital inicial",
    );
    assert(result.closedTrades === 9, "todas as posições aceitas devem ser contabilizadas como fechadas");
    assert(result.rejectedTrades === 11, "entradas além do limite de exposição devem ser rejeitadas");
    console.log("PASS");
  }

  {
    process.stdout.write("2. Custos de execução afetam o patrimônio... ");
    const klines = [candle(100, 0), candle(100, 1)];
    const trades = [{
      id: 1,
      signalIndex: 0,
      exitIndex: 1,
      side: "BUY" as const,
      outcome: closedOutcome(100, 100, -0.3, 0, 0.2, 0.1),
    }];

    const result = simulateWalkForwardPortfolio({
      klines,
      trades,
      totalSignals: 1,
      initialCapital: 1000,
      positionSizePct: 2,
      maxGrossExposurePct: 20,
    });

    approx(result.totalRealizedPnl, -0.06, 0.000001, "P&L deve refletir -0,3% sobre notional de $20");
    approx(result.finalEquity, 999.94, 0.000001, "equity final deve incluir custos");
    approx(result.totalFees, 0.04, 0.000001, "fees devem refletir 0,2% sobre o notional");
    approx(result.totalSlippage, 0.02, 0.000001, "slippage deve refletir 0,1% sobre o notional");
    console.log("PASS");
  }

  {
    process.stdout.write("3. Posição aberta é liquidada no fim do fold... ");
    const klines = [candle(100, 0), candle(101, 1)];
    const trades = [{
      id: 1,
      signalIndex: 0,
      exitIndex: 1,
      side: "BUY" as const,
      outcome: {
        ...closedOutcome(100, 100, 0, 0, 0, 0),
        outcome: "open" as const,
        exitPrice: null,
        profitPercent: 0,
        feePercent: 0,
        slippagePercent: 0,
        exitReason: "end" as const,
      },
    }];

    const result = simulateWalkForwardPortfolio({
      klines,
      trades,
      totalSignals: 1,
      initialCapital: 1000,
      positionSizePct: 2,
      maxGrossExposurePct: 20,
    });

    assert(result.closedTrades === 0, "posição aberta não deve virar trade fechado");
    assert(result.finalEquity > 1000, "alta de 1% deve gerar equity final positiva após liquidação");
    assert(result.totalRealizedPnl > 0, "liquidação deve realizar o P&L");
    console.log("PASS");
  }

  {
    process.stdout.write("4. Parâmetros inválidos são rejeitados... ");
    let failed = false;
    try {
      simulateWalkForwardPortfolio({
        klines: [candle(100, 0)],
        trades: [],
        totalSignals: 0,
        initialCapital: 1000,
        positionSizePct: 25,
        maxGrossExposurePct: 20,
      });
    } catch {
      failed = true;
    }
    assert(failed, "positionSizePct maior que maxGrossExposurePct deve falhar");
    console.log("PASS");
  }

  console.log("=== TESTES DO WALK-FORWARD PORTFOLIO CONCLUÍDOS ===");
}

if (
  process.argv[1]?.endsWith("walkForwardEngine.test.ts") ||
  process.argv[1]?.endsWith("walkForwardEngine.test.js")
) {
  runWalkForwardPortfolioTests();
}
