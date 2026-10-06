import {
  FIXED_POSITION_PCT,
  assertFrozenForOOS,
  thresholds,
} from "../config/thresholds.js";
import { callJev, JevModelVersionMismatchError, JevUnavailableError, type JevResponse } from "../jev/jevClient.js";
import type { DecisionResult, MarketState, Recomendacao } from "../domain/trading.js";

const CHOICE_TO_RECOMENDACAO: Record<"ALTA" | "BAIXA" | "AGUARDAR", Recomendacao> = {
  ALTA: "BUY",
  BAIXA: "SELL",
  AGUARDAR: "WAIT",
};

function choiceToRecomendacao(choice: "ALTA" | "BAIXA" | "AGUARDAR"): Recomendacao {
  return CHOICE_TO_RECOMENDACAO[choice];
}

function probabilityForChoice(
  probabilities: Record<string, number>,
  choice: "ALTA" | "BAIXA" | "AGUARDAR",
): number {
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
    confidence: jev.direcao.confidence,
    probabilidadeDirecional: probEscolhida,
    riscoElevado,
    jevChoice: escolha,
    jevProbs: jev.direcao.probabilities,
    jevModelVersion: jev.modelVersion ?? "unreported",
    observacao: `confidence=${jev.direcao.confidence.toFixed(2)} prob=${probEscolhida.toFixed(2)}`,
  };
}

export async function decideWithJev(
  market: MarketState,
  mode: "dev" | "oos" = "dev",
  callJevImpl: typeof callJev = callJev,
): Promise<DecisionResult> {
  assertFrozenForOOS(mode);
  try {
    const jev = await callJevImpl(market);
    return evaluateJevResponse(jev);
  } catch (error) {
    if (error instanceof JevModelVersionMismatchError) throw error;
    if (error instanceof JevUnavailableError) {
      return {
        origem: "jev",
        recomendacao: "WAIT",
        tamanhoPosicaoPct: 0,
        qualityScore: 0,
        confidence: 0,
        probabilidadeDirecional: 0,
        riscoElevado: false,
        jevChoice: "AGUARDAR",
        jevProbs: {},
        jevModelVersion: "unreported",
        observacao: "jev=unavailable fallback=WAIT",
      };
    }
    throw error;
  }
}
