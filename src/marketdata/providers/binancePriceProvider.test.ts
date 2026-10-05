import assert from "node:assert/strict";
import type { Kline } from "../../types.js";
import { BinancePriceProvider } from "./binancePriceProvider.js";

const candle: Kline = {
  openTime: new Date("2026-10-05T10:00:00.000Z"),
  closeTime: new Date("2026-10-05T10:59:59.999Z"),
  open: 100,
  high: 105,
  low: 99,
  close: 104,
  volume: 10,
};

let receivedSymbol = "";
let receivedTimeframe = "";
let receivedOptions: unknown;
const candleCloseTime = candle.closeTime;
if (!candleCloseTime) throw new Error("Test candle must have closeTime");

const provider = new BinancePriceProvider({
  fetchCandles: async (symbol, timeframe, options) => {
    receivedSymbol = symbol;
    receivedTimeframe = timeframe;
    receivedOptions = options;
    return [candle];
  },
});

const candles = await provider.getCandles({
  instrument: "BTCUSDT",
  timeframe: "1h",
  limit: 5,
  startTime: candle.openTime.getTime(),
  endTime: candleCloseTime.getTime(),
});

assert.deepEqual(candles, [candle]);
assert.equal(receivedSymbol, "BTCUSDT");
assert.equal(receivedTimeframe, "1h");
assert.deepEqual(receivedOptions, {
  limit: 5,
  startTime: candle.openTime.getTime(),
  endTime: candle.closeTime.getTime(),
});

const metadata = provider.getMetadata({
  instrument: "BTCUSDT",
  timeframe: "1h",
});
assert.deepEqual(metadata, {
  provider: "binance",
  instrument: "BTCUSDT",
  timeframe: "1h",
  source: "binance",
  quoteMode: "close_only",
});

console.log("Binance price provider tests passed");
