import type { PriceProvider } from "./priceProvider.js";

export class PriceProviderRegistry {
  private readonly providers = new Map<string, PriceProvider>();

  constructor(providers: PriceProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: PriceProvider): this {
    const id = provider.id.trim();
    if (!id) throw new Error("Price provider id is required");
    if (this.providers.has(id)) {
      throw new Error(`Price provider already registered: ${id}`);
    }

    this.providers.set(id, provider);
    return this;
  }

  has(id: string): boolean {
    return this.providers.has(id.trim());
  }

  get(id: string): PriceProvider | undefined {
    return this.providers.get(id.trim());
  }

  require(id: string): PriceProvider {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error("Price provider id is required");

    const provider = this.providers.get(normalizedId);
    if (!provider) throw new Error(`Price provider not registered: ${normalizedId}`);
    return provider;
  }

  list(): string[] {
    return [...this.providers.keys()].sort();
  }
}
