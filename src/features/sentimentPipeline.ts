export interface NewsHeadline {
  source: string;
  title: string;
  publishedAt: Date;
}

export interface NewsSource {
  fetchRecent(ativo: string): Promise<NewsHeadline[]>;
}

const REQUEST_TIMEOUT_MS = 8_000;

function assetQuery(ativo: string): { symbol: string; query: string } {
  const normalized = ativo.toUpperCase().replace(/[-_/]/g, "");

  if (normalized === "BTC" || normalized === "BTCUSD" || normalized === "BTCUSDT") {
    return { symbol: "BTC", query: "Bitcoin OR BTC" };
  }

  return { symbol: normalized, query: normalized };
}

function isValidHeadline(headline: NewsHeadline): boolean {
  return (
    typeof headline.title === "string" &&
    headline.title.trim().length > 0 &&
    headline.publishedAt instanceof Date &&
    !Number.isNaN(headline.publishedAt.getTime())
  );
}

async function fetchJson(url: string): Promise<any> {
  const signal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`News provider error: ${res.status}`);
  return res.json();
}

export class CryptoPanicSource implements NewsSource {
  constructor(private apiKey: string) {}

  async fetchRecent(ativo: string): Promise<NewsHeadline[]> {
    if (!this.apiKey) return [];

    const { symbol } = assetQuery(ativo);
    const url =
      `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(this.apiKey)}&currencies=${encodeURIComponent(symbol)}`;

    const data = await fetchJson(url);

    return (Array.isArray(data?.results) ? data.results : [])
      .map((r: any): NewsHeadline => ({
        source: "cryptopanic",
        title: String(r?.title ?? ""),
        publishedAt: new Date(r?.published_at),
      }))
      .filter(isValidHeadline);
  }
}

export class GdeltSource implements NewsSource {
  constructor(private baseUrl = "https://api.gdeltproject.org/api/v2") {}

  async fetchRecent(ativo: string): Promise<NewsHeadline[]> {
    const { query } = assetQuery(ativo);
    const url =
      `${this.baseUrl.replace(/\/$/, "")}/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=50`;

    const data = await fetchJson(url);

    return (Array.isArray(data?.articles) ? data.articles : [])
      .map((a: any): NewsHeadline => ({
        source: "gdelt",
        title: String(a?.title ?? ""),
        publishedAt: new Date(a?.seendate),
      }))
      .filter(isValidHeadline);
  }
}

const POSITIVE_PHRASES = [
  "surge",
  "rally",
  "bullish",
  "adoption",
  "approve",
  "etf inflow",
  "inflow",
  "alta",
  "alta de",
  "subida",
  "valorização",
  "aprovação",
  "entrada",
];

const NEGATIVE_PHRASES = [
  "crash",
  "bearish",
  "hack",
  "ban",
  "lawsuit",
  "outflow",
  "queda",
  "queda de",
  "baixa",
  "desvalorização",
  "proibição",
  "saída",
];

function phraseMatches(text: string, phrase: string): boolean {
  return text.includes(phrase);
}

function headlineScore(title: string): number {
  const text = title.toLocaleLowerCase("en-US");

  const positiveHits = POSITIVE_PHRASES.filter((phrase) => phraseMatches(text, phrase)).length;
  const negativeHits = NEGATIVE_PHRASES.filter((phrase) => phraseMatches(text, phrase)).length;

  if (positiveHits === 0 && negativeHits === 0) return 0;

  const raw = positiveHits - negativeHits;
  return Math.max(-1, Math.min(1, raw));
}

export function scoreHeadlines(headlines: NewsHeadline[]): number {
  const valid = headlines.filter(isValidHeadline);
  if (!valid.length) return 0;

  const total = valid.reduce((sum, headline) => sum + headlineScore(headline.title), 0);
  return Math.max(-1, Math.min(1, total / valid.length));
}

export async function getSentiment(ativo: string, sources: NewsSource[]): Promise<number> {
  if (!sources.length) return 0;

  const results = await Promise.allSettled(sources.map((source) => source.fetchRecent(ativo)));
  const headlines = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.filter(isValidHeadline) : []
  );

  return scoreHeadlines(headlines);
}
