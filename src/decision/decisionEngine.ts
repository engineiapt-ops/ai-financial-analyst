import { FIXED_POSITION_PCT, JEV_MODEL_VERSION, assertFrozenForOOS, thresholds } from "../config/thresholds.js";
import { callJev } from "../jev/jevClient.js";
import type { DecisionResult, MarketState, Recomendacao } from "../types.js";

function choiceToRecomendacao(choice: "ALTA" | "BAIXA" | "AGUARDAR"): Recomendacao {
  const map: Record<"ALTA" | "BAIXA" | "AGUARDAR", Recomendacao> = {
    ALTA: "BUY",
    BAIXA: "SELL",
    AGUARDAR: "WAIT",
  };
  return map[choice];
}

export async function decideWithJev(market: MarketState, mode: "dev" | "oos" = "dev"): Promise<DecisionResult> {
  assertFrozenForOOS(mode);
  const jev = await callJev(market);
  const probs = typeof jev.direcao.probabilities === "object" && !Array.isArray(jev.direcao.probabilities)
    ? jev.direcao.probabilities as Record<string, number> : {};
  const escolhida = jev.direcao.choice ?? "AGUARDAR";
  const probEscolhida = probs[escolhida] ?? 0;
  const riscoElevado = (jev.risco_elevado.noul ?? 0) >= 0.5;
  let recomendacao = choiceToRecomendacao(escolhida);
  if (jev.direcao.confidence < thresholds.minConfidence) recomendacao = "WAIT";
  if (probEscolhida < thresholds.minProbabilidade) recomendacao = "WAIT";
  if (thresholds.bloquearSeRiscoElevado && riscoElevado) recomendacao = "WAIT";
  return {
    origem: "jev", recomendacao,
    tamanhoPosicaoPct: recomendacao === "WAIT" ? 0 : FIXED_POSITION_PCT,
    qualityScore: jev.qualidade.score, riscoElevado, jevChoice: escolhida,
    jevProbs: probs, jevModelVersion: JEV_MODEL_VERSION,
    observacao: `confidence=${jev.direcao.confidence.toFixed(2)} prob=${probEscolhida.toFixed(2)}`
  };
}
