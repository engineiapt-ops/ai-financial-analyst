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
