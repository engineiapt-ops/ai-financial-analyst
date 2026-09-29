import "dotenv/config";
import { fetchKlinesHistory } from "./binanceClient.js";
import { saveMarketData } from "../db/repository.js";
import { computeDatasetHash } from "./dataset.js";
import type { Timeframe } from "../types.js";

function getArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function getPositiveInt(name: string, fallback: number): number {
  const raw = getArg(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function main() {
  const symbol = String(getArg("--symbol", "BTCUSDT")).toUpperCase();
  const timeframe = String(getArg("--timeframe", "1h")) as Timeframe;
  const candles = getPositiveInt("--candles", 5000);

  if (!["1h", "4h", "1d"].includes(timeframe)) {
    throw new Error("timeframe must be 1h, 4h or 1d");
  }

  const klines = await fetchKlinesHistory(symbol, timeframe, {
    totalCandles: candles,
    chunkSize: 1000,
    delayMs: 150,
  });

  if (klines.length < candles) {
    throw new Error(`Binance returned only ${klines.length} closed candles; requested ${candles}`);
  }

  const saved = await saveMarketData(symbol, timeframe, klines);
  const hash = computeDatasetHash(klines);

  console.log(JSON.stringify({
    status: "ok",
    symbol,
    timeframe,
    requested: candles,
    received: klines.length,
    saved,
    datasetHash: hash,
    periodStart: klines[0].openTime.toISOString(),
    periodEnd: klines[klines.length - 1].openTime.toISOString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
