export interface NewsHeadline {
  source: string;
  title: string;
  publishedAt: Date;
}

export interface NewsSource {
  fetchRecent(ativo: string): Promise<NewsHeadline[]>;
}

export class CryptoPanicSource implements NewsSource {
  constructor(private apiKey: string) {}
  async fetchRecent(ativo: string): Promise<NewsHeadline[]> {
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${this.apiKey}&currencies=${ativo}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CryptoPanic error: ${res.status}`);
    const data = await res.json() as any;
    return (data.results ?? []).map((r: any) => ({
      source: "cryptopanic", title: r.title as string, publishedAt: new Date(r.published_at)
    }));
  }
}

export class GdeltSource implements NewsSource {
  constructor(private baseUrl: string) {}
  async fetchRecent(ativo: string): Promise<NewsHeadline[]> {
    const query = encodeURIComponent(`${ativo} bitcoin`);
    const url = `${this.baseUrl}/doc/doc?query=${query}&mode=artlist&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GDELT error: ${res.status}`);
    const data = await res.json() as any;
    return (data.articles ?? []).map((a: any) => ({
      source: "gdelt", title: a.title as string, publishedAt: new Date(a.seendate)
    }));
  }
}

const POSITIVE_WORDS = ["surge", "rally", "bullish", "alta", "adoption", "approve", "etf inflow"];
const NEGATIVE_WORDS = ["crash", "bearish", "queda", "hack", "ban", "lawsuit", "outflow"];

export function scoreHeadlines(headlines: NewsHeadline[]): number {
  if (!headlines.length) return 0;
  let score = 0;
  for (const h of headlines) {
    const text = h.title.toLowerCase();
    if (POSITIVE_WORDS.some(w => text.includes(w))) score += 1;
    if (NEGATIVE_WORDS.some(w => text.includes(w))) score -= 1;
  }
  return Math.max(-1, Math.min(1, score / headlines.length));
}

export async function getSentiment(ativo: string, sources: NewsSource[]): Promise<number> {
  const results = await Promise.allSettled(sources.map(s => s.fetchRecent(ativo)));
  const headlines = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  return scoreHeadlines(headlines);
}
