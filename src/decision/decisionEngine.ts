import {
  FIXED_POSITION_PCT,
  JEV_MODEL_VERSION,
  assertFrozenForOOS,
  thresholds,
} from "../config/thresholds.js";
import { callJev, type JevResponse } from "../jev/jevClient.js";
import type { DecisionResult, MarketState, Recomendacao } from "../types.js";

function choiceToRecomendacao(choice: "ALTA" | "BAIXA" | "AGUARDAR"): Recomendacao {
  return {
    ALTA: "BUY",
    BAIXA: "SELL",
    AGUARDAR: "WAIT",
  }[choice];
}

function probabilityForChoice(
  probabilities: Record<string, number> | number[],
  choice: "ALTA" | "BAIXA" | "AGUARDAR",
): number {
  if (Array.isArray(probabilities)) return 0;
  const value = probabilities[choice];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function evaluateJevResponse(jev: JevResponse): DecisionResult {
  const escolha = jev.direcao.choice ?? "AGUARDAR";
  const probEscolhida = probabilityForChoice(jev.direcao.probabilities, escolha);
  const riscoElevado = (jev.risco_elevado.noul ?? 0) >= 0.5;

  let recomendacao = choiceToRecomendacao(escolha);

  if (jev.direcao.confidence < thresholds.minConfidence) recomendacao = "WAIT";
  if (probEscolhida < thresholds.minProbabilidade) recomendacao = "WAIT";
  if (thresholds.bloquearSeRiscoElevado && riscoElevado) recomendacao = "WAIT";

  return {
    origem: "jev",
    recomendacao,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : FIXED_POSITION_PCT,
    qualityScore: jev.qualidade.score,
    riscoElevado,
    jevChoice: escolha,
    jevProbs: Array.isArray(jev.direcao.probabilities) ? {} : jev.direcao.probabilities,
    jevModelVersion: JEV_MODEL_VERSION,
    observacao: `confidence=${jev.direcao.confidence.toFixed(2)} prob=${probEscolhida.toFixed(2)}`,
  };
}

export async function decideWithJev(
  market: MarketState,
  mode: "dev" | "oos" = "dev",
): Promise<DecisionResult> {
  assertFrozenForOOS(mode);
  const jev = await callJev(market);
  return evaluateJevResponse(jev);
}
