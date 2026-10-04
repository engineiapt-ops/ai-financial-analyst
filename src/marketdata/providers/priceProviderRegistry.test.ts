import type { Kline } from "../../types.js";
import type { PriceProvider, PriceQuery, PriceProviderMetadata } from "./priceProvider.js";
import { PriceProviderRegistry } from "./priceProviderRegistry.js";

function fakeProvider(id: string): PriceProvider {
  return {
    id,
    async getCandles(_query: PriceQuery): Promise<Kline[]> {
      return [];
    },
    getMetadata(query: PriceQuery): PriceProviderMetadata {
      return {
        provider: id,
        instrument: query.instrument,
        timeframe: query.timeframe,
        source: "broker",
        quoteMode: "bid_ask",
      };
    },
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const registry = new PriceProviderRegistry([
  fakeProvider("saxo-sim"),
  fakeProvider("ig-demo"),
]);

assert(registry.list().join(",") === "ig-demo,saxo-sim", "providers should be sorted");
assert(registry.has("ig-demo"), "registered provider should be discoverable");
assert(registry.get("saxo-sim")?.id === "saxo-sim", "get should return the registered provider");
assert(registry.require(" ig-demo ").id === "ig-demo", "require should trim the provider id");

let missingError = "";
try {
  registry.require("missing");
} catch (error) {
  missingError = error instanceof Error ? error.message : String(error);
}
assert(missingError === "Price provider not registered: missing", "missing provider should fail deterministically");

let duplicateError = "";
try {
  registry.register(fakeProvider("ig-demo"));
} catch (error) {
  duplicateError = error instanceof Error ? error.message : String(error);
}
assert(duplicateError === "Price provider already registered: ig-demo", "duplicate provider should be rejected");

let emptyIdError = "";
try {
  registry.register(fakeProvider("   "));
} catch (error) {
  emptyIdError = error instanceof Error ? error.message : String(error);
}
assert(emptyIdError === "Price provider id is required", "empty provider id should be rejected");

console.log("PriceProviderRegistry tests passed");
