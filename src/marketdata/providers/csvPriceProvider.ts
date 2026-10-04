import type { Kline, Timeframe } from "../../types.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";

export interface CsvPriceProviderOptions {
  csv: string;
  providerId?: string;
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid CSV ${field}`);
  return date;
}

function requiredNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid CSV ${field}`);
  return parsed;
}

export class CsvPriceProvider implements PriceProvider {
  readonly id: string;

  private readonly rows: Kline[];

  constructor(options: CsvPriceProviderOptions) {
    this.id = options.providerId ?? "csv";
    const lines = options.csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("CSV must contain a header and at least one row");

    const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
    const index = (name: string) => headers.indexOf(name);
    const required = ["open_time", "open", "high", "low", "close", "volume"];
    for (const field of required) {
      if (index(field) < 0) throw new Error(`CSV missing required column: ${field}`);
    }

    this.rows = lines.slice(1).map((line) => {
      const values = line.split(",").map((item) => item.trim());
      return {
        openTime: parseDate(values[index("open_time")], "open_time"),
        open: requiredNumber(values[index("open")], "open"),
        high: requiredNumber(values[index("high")], "high"),
        low: requiredNumber(values[index("low")], "low"),
        close: requiredNumber(values[index("close")], "close"),
        volume: requiredNumber(values[index("volume")], "volume"),
        closeTime: index("close_time") >= 0
          ? parseDate(values[index("close_time")], "close_time")
          : undefined,
      };
    }).sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  }

  async getCandles(query: PriceQuery): Promise<Kline[]> {
    const asOf = query.endTime ?? Number.POSITIVE_INFINITY;
    return this.rows
      .filter((row) => row.openTime.getTime() >= (query.startTime ?? Number.NEGATIVE_INFINITY))
      .filter((row) => (row.closeTime ?? row.openTime).getTime() <= asOf)
      .slice(-(query.limit ?? this.rows.length));
  }

  getMetadata(query: PriceQuery): PriceProviderMetadata {
    return {
      provider: this.id,
      instrument: query.instrument,
      timeframe: query.timeframe,
      source: "csv",
      quoteMode: "close_only",
    };
  }
}
