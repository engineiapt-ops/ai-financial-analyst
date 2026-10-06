import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const backendSource = readFileSync(
  new URL("../app/createApp.ts", import.meta.url),
  "utf8",
);
const overviewSource = readFileSync(
  new URL("./MarketOverviewView.tsx", import.meta.url),
  "utf8",
);
const tickerSource = readFileSync(
  new URL("../components/TickerTape.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../App.tsx", import.meta.url),
  "utf8",
);

assert(
  backendSource.includes("source: 'static-demo'"),
  "market overview must explicitly identify static demo data",
);
assert(
  backendSource.includes("asOf: new Date().toISOString()"),
  "market overview must expose response timestamp",
);
assert(
  backendSource.includes("TODO: replace this demo snapshot with a real market-data provider"),
  "market overview must document the future real provider integration",
);
assert(
  overviewSource.includes("Dados ilustrativos"),
  "market overview UI must visibly label static data",
);
assert(
  overviewSource.includes("marketData.source === 'static-demo'"),
  "market overview UI must key the warning off provenance",
);
assert(
  tickerSource.includes("Dados ilustrativos"),
  "ticker tape must visibly label static data",
);
assert(
  appSource.includes("source={marketData.source}"),
  "app must propagate market provenance to ticker tape",
);

console.log("market overview provenance tests: OK");
