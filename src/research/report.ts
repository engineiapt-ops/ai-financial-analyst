import { z } from "zod";
import { filterNewsByAsOf } from "../marketdata/pointInTime.js";
import {
  CryptoPanicSource,
  GdeltSource,
  scoreHeadline,
  type NewsHeadline,
  type NewsSource,
} from "../features/sentimentPipeline.js";
import type { AnalyzeOutput } from "../api/analyze.js";

export const AnalystReportSchema = z.object({
  titulo: z.string(),
  resumo: z.string(),
  drivers: z.array(z.string()),
  riscos: z.array(z.string()),
  invalidacao: z.string(),
  recomendacao: z.enum(["BUY", "WAIT", "SELL"]),
  confianca: z.number().min(0).max(1),
  fonteDecisao: z.enum(["quantitativo", "quantitativo_com_contexto"]),
});

export type AnalystReport = z.infer<typeof AnalystReportSchema>;

export interface ResearchEvidence {
  source: string;
  title: string;
  publishedAt: string;
  url?: string;
  sentimentScore: number;
  stance: "positive" | "neutral" | "negative";
}

export interface ResearchSourceStatus {
  source: string;
  status: "ok" | "error";
  headlines: number;
}

export interface AnalystResearchResult {
  asOf: string;
  sentiment: number;
  evidence: ResearchEvidence[];
  sources: ResearchSourceStatus[];
  report: AnalystReport;
}

function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function recommendationText(recommendation: AnalyzeOutput["decision"]["recomendacao"]): string {
  if (recommendation === "BUY") return "O motor quantitativo identificou condição compatível com entrada.";
  if (recommendation === "SELL") return "O motor quantitativo identificou condição compatível com saída.";
  return "O motor quantitativo não encontrou condição suficiente para entrada ou saída.";
}

function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stanceFromScore(score: number): ResearchEvidence["stance"] {
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

export function buildDeterministicReport(input: AnalyzeOutput, sentiment: number, evidence: ResearchEvidence[]): AnalystReport {
  const { market, decision, risk } = input;
  const ema9 = market.indicators.ema9;
  const ema21 = market.indicators.ema21;
  const rsi = market.indicators.rsi;
  const atr = market.indicators.atr;

  const drivers: string[] = [
    recommendationText(decision.recomendacao),
    `Preço de referência: ${market.precoAtual.toFixed(2)}; EMA9=${ema9?.toFixed(2) ?? "n/d"}; EMA21=${ema21?.toFixed(2) ?? "n/d"}.`,
  ];

  if (rsi !== null) drivers.push(`RSI(14): ${rsi.toFixed(1)}.`);
  if (atr !== null) drivers.push(`ATR: ${atr.toFixed(2)}.`);
  if (sentiment !== 0) {
    drivers.push(`Sentimento de notícias agregado: ${pct(sentiment * 100)} em uma escala limitada entre -100% e +100%.`);
  } else if (evidence.length === 0) {
    drivers.push("Não houve evidência de notícias utilizável para o corte temporal analisado.");
  }

  const riscos: string[] = [
    `Regime de risco: ${risk.regime.key}.`,
    `Controle de risco: ${risk.reason}.`,
  ];
  if (decision.riscoElevado) riscos.push("A decisão final está marcada como risco elevado.");
  if (evidence.length > 0) riscos.push(`O contexto externo contém ${evidence.length} manchete(s) e não deve ser tratado como confirmação causal do movimento de preço.`);

  const invalidacao =
    decision.recomendacao === "BUY"
      ? "Reavaliar se o próximo fechamento perder as condições que sustentaram a decisão ou se o motor de risco bloquear a exposição."
      : decision.recomendacao === "SELL"
        ? "Reavaliar se o próximo fechamento recuperar as condições que sustentaram a decisão ou se o motor de risco bloquear a exposição."
        : "Uma nova decisão deve ser calculada com novo candle fechado; esta análise não cria uma posição.";

  const rawConfidence = decision.confidence ?? decision.qualityScore ?? 0;
  const confianca = Math.max(0, Math.min(1, Number.isFinite(rawConfidence) ? rawConfidence : 0));

  return AnalystReportSchema.parse({
    titulo: `Relatório ${market.ativo} ${market.timeframe}`,
    resumo: `${recommendationText(decision.recomendacao)} ${decision.observacao ?? ""}`.trim(),
    drivers,
    riscos,
    invalidacao,
    recomendacao: decision.recomendacao,
    confianca,
    fonteDecisao: evidence.length > 0 ? "quantitativo_com_contexto" : "quantitativo",
  });
}

export function createDefaultResearchSources(): NewsSource[] {
  const sources: NewsSource[] = [new GdeltSource()];
  const cryptoPanicKey = process.env.CRYPTOPANIC_API_KEY?.trim();
  if (cryptoPanicKey) sources.push(new CryptoPanicSource(cryptoPanicKey));
  return sources;
}

export async function collectResearchEvidence(
  ativo: string,
  asOf: Date,
  sources: NewsSource[] = createDefaultResearchSources(),
): Promise<{
  sentiment: number;
  evidence: ResearchEvidence[];
  sources: ResearchSourceStatus[];
}> {
  const results = await Promise.allSettled(sources.map((source) => source.fetchRecent(ativo)));
  const sourceStatus: ResearchSourceStatus[] = [];
  const allHeadlines: NewsHeadline[] = [];

  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      const valid = result.value.filter(
        (headline) =>
          typeof headline.title === "string" &&
          headline.title.trim().length > 0 &&
          headline.publishedAt instanceof Date &&
          !Number.isNaN(headline.publishedAt.getTime()),
      );
      sourceStatus.push({
        source: source.constructor.name,
        status: "ok",
        headlines: valid.length,
      });
      allHeadlines.push(...valid);
    } else {
      sourceStatus.push({
        source: source.constructor.name,
        status: "error",
        headlines: 0,
      });
    }
  });

  const filtered = filterNewsByAsOf(allHeadlines, asOf)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const seen = new Set<string>();
  const evidence = filtered
    .filter((headline) => {
      const key = normalizeTitle(headline.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((headline) => {
      const sentimentScore = scoreHeadline(headline.title);
      return {
        source: headline.source,
        title: headline.title,
        publishedAt: headline.publishedAt.toISOString(),
        ...(headline.url ? { url: headline.url } : {}),
        sentimentScore,
        stance: stanceFromScore(sentimentScore),
      };
    });

  const sentiment = evidence.length === 0
    ? 0
    : Math.max(-1, Math.min(1, evidence.reduce((sum, item) => sum + item.sentimentScore, 0) / evidence.length));

  return { sentiment, evidence, sources: sourceStatus };
}

export async function generateAnalystReport(input: AnalyzeOutput): Promise<AnalystResearchResult> {
  const asOf = new Date(input.market.dataAsOf);
  const research = await collectResearchEvidence(input.market.ativo, asOf);
  const report = buildDeterministicReport(input, research.sentiment, research.evidence);

  return {
    asOf: asOf.toISOString(),
    sentiment: research.sentiment,
    evidence: research.evidence,
    sources: research.sources,
    report,
  };
}
