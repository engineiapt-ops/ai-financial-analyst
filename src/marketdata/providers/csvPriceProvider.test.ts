import { strict as assert } from "node:assert";
import { CsvPriceProvider } from "./csvPriceProvider.js";

const provider = new CsvPriceProvider({
  csv: [
    "open_time,open,high,low,close,volume,close_time",
    "2026-01-01T00:00:00Z,100,110,90,105,10,2026-01-01T00:59:59Z",
    "2026-01-01T01:00:00Z,105,115,100,112,12,2026-01-01T01:59:59Z",
  ].join("\n"),
});

const rows = await provider.getCandles({
  instrument: "TEST",
  timeframe: "1h",
  limit: 10,
  endTime: Date.parse("2026-01-01T01:59:59Z"),
});
assert.equal(rows.length, 2);
assert.equal(rows[1].close, 112);
assert.equal(provider.getMetadata({ instrument: "TEST", timeframe: "1h" }).source, "csv");
assert.throws(
  () => new CsvPriceProvider({ csv: "open,close\n1,2" }),
  /missing required column/,
);
console.log("price provider tests passed");
