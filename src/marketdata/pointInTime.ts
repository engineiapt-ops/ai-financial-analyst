import type { Kline } from "../types.js";
import type { NewsHeadline } from "../features/sentimentPipeline.js";

export interface PointInTimeContext {
  asOf: Date;
}

export function createPointInTimeContext(asOf: Date | number): PointInTimeContext {
  const date = asOf instanceof Date ? new Date(asOf.getTime()) : new Date(asOf);
  if (Number.isNaN(date.getTime())) {
    throw new Error("asOf must be a valid date");
  }
  return { asOf: date };
}

export function assertKlinesAvailableAsOf(
  klines: Kline[],
  asOf: Date | number,
): void {
  const context = createPointInTimeContext(asOf);
  for (const kline of klines) {
    const closeTime = kline.closeTime ?? kline.openTime;
    if (closeTime.getTime() > context.asOf.getTime()) {
      throw new Error(
        `Point-in-time violation: candle ${closeTime.toISOString()} is after asOf ${context.asOf.toISOString()}`,
      );
    }
  }
}

export function filterNewsByAsOf(
  headlines: NewsHeadline[],
  asOf: Date | number,
): NewsHeadline[] {
  const context = createPointInTimeContext(asOf);
  return headlines.filter(
    (headline) => headline.publishedAt.getTime() <= context.asOf.getTime(),
  );
}

export function assertNewsAvailableAsOf(
  headlines: NewsHeadline[],
  asOf: Date | number,
): void {
  const context = createPointInTimeContext(asOf);
  const violating = headlines.find(
    (headline) => headline.publishedAt.getTime() > context.asOf.getTime(),
  );
  if (violating) {
    throw new Error(
      `Point-in-time violation: news item ${violating.publishedAt.toISOString()} is after asOf ${context.asOf.toISOString()}`,
    );
  }
}
