import crypto from "node:crypto";
import type { Kline } from "../types.js";

/**
 * Calcula o hash determinístico SHA-256 de um conjunto de klines ordenados.
 * Garante a integridade e identificação unívoca do dataset utilizado em backtests.
 */
export function computeDatasetHash(klines: Kline[]): string {
  if (klines.length === 0) return "";
  const hash = crypto.createHash("sha256");
  for (const k of klines) {
    const ts = k.openTime instanceof Date ? k.openTime.getTime() : new Date(k.openTime).getTime();
    hash.update(`${ts}:${k.open}:${k.high}:${k.low}:${k.close}:${k.volume}\n`);
  }
  return hash.digest("hex");
}

export function assertDatasetMatchesMetadata(
  klines: Kline[],
  expectedCount: number | null,
  expectedHash: string | null,
): string {
  if (expectedCount === null || expectedHash === null || expectedHash === "") {
    throw new Error("Backtest run does not contain complete dataset metadata; reproducibility cannot be verified");
  }

  if (klines.length !== expectedCount) {
    throw new Error(
      `Dataset candle count mismatch: expected ${expectedCount}, received ${klines.length}`,
    );
  }

  const actualHash = computeDatasetHash(klines);
  if (actualHash !== expectedHash) {
    throw new Error(
      `Dataset hash mismatch: expected ${expectedHash}, received ${actualHash}`,
    );
  }

  return actualHash;
}
