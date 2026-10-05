import { MarketDataService } from "./service.js";
import { PriceProviderRegistry } from "./providers/priceProviderRegistry.js";
import { BinancePriceProvider } from "./providers/binancePriceProvider.js";

/**
 * Application default market-data service.
 *
 * The factory is intentionally small: provider selection remains explicit and
 * callers depend on the MarketDataService port rather than the Binance client.
 */
export function createDefaultMarketDataService(): MarketDataService {
  return new MarketDataService(
    new PriceProviderRegistry([
      new BinancePriceProvider(),
    ]),
  );
}
