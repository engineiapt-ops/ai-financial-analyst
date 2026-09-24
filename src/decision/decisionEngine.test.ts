import { freezeThresholds, thresholds, areThresholdsFrozen } from "../config/thresholds.js";
import { evaluateJevResponse } from "./decisionEngine.js";
import type { JevResponse } from "../jev/jevClient.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function response(overrides: Partial<JevResponse["direcao"]> = {}): JevResponse {
  return {
    direcao: {
      choice: "ALTA",
      probabilities: { ALTA: 0.8, BAIXA: 0.1, AGUARDAR: 0.1 },
      confidence: 0.9,
      ...overrides,
    },
    risco_elevado: { probabilities: {}, confidence: 1, noul: 0 },
    qualidade: { probabilities: {}, confidence: 1, score: 0.8 },
  };
}

export function runDecisionEngineTests() {
  console.log("=== INÍCIO DOS TESTES DO DECISION ENGINE ===");

  {
    process.stdout.write("1. ALTA com thresholds atendidos -> BUY e 2%... ");
    const result = evaluateJevResponse(response());
    assert(result.recomendacao === "BUY", "ALTA forte deve produzir BUY");
    assert(result.tamanhoPosicaoPct === 2, "posição fixa deve ser 2%");
    console.log("PASS");
  }

  {
    process.stdout.write("2. BAIXA com thresholds atendidos -> SELL e 2%... ");
    const result = evaluateJevResponse(response({
      choice: "BAIXA",
      probabilities: { ALTA: 0.1, BAIXA: 0.8, AGUARDAR: 0.1 },
    }));
    assert(result.recomendacao === "SELL", "BAIXA forte deve produzir SELL");
    assert(result.tamanhoPosicaoPct === 2, "posição fixa deve ser 2%");
    console.log("PASS");
  }

  {
    process.stdout.write("3. Confidence abaixo do threshold -> WAIT e posição zero... ");
    const result = evaluateJevResponse(response({ confidence: 0.64 }));
    assert(result.recomendacao === "WAIT", "confidence baixa deve bloquear");
    assert(result.tamanhoPosicaoPct === 0, "WAIT não pode abrir posição");
    console.log("PASS");
  }

  {
    process.stdout.write("4. Probabilidade abaixo do threshold -> WAIT... ");
    const result = evaluateJevResponse(response({
      probabilities: { ALTA: 0.59, BAIXA: 0.21, AGUARDAR: 0.20 },
    }));
    assert(result.recomendacao === "WAIT", "probabilidade baixa deve bloquear");
    console.log("PASS");
  }

  {
    process.stdout.write("5. Risco elevado -> WAIT... ");
    const result = evaluateJevResponse({
      ...response(),
      risco_elevado: { probabilities: {}, confidence: 1, noul: 0.5 },
    });
    assert(result.riscoElevado === true, "risco >= 0.5 deve ser elevado");
    assert(result.recomendacao === "WAIT", "risco elevado deve bloquear");
    console.log("PASS");
  }

  {
    process.stdout.write("6. Thresholds devem congelar de forma irreversível... ");
    freezeThresholds();
    assert(areThresholdsFrozen(), "thresholds devem estar congelados");
    assert(thresholds.frozenAt !== null, "frozenAt deve existir");
    console.log("PASS");
  }

  console.log("=== TESTES DO DECISION ENGINE CONCLUÍDOS ===");
}

if (process.argv[1]?.endsWith("decisionEngine.test.ts") || process.argv[1]?.endsWith("decisionEngine.test.js")) {
  runDecisionEngineTests();
}
