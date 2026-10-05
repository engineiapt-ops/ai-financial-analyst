export type InstrumentMappingStatus = "verified" | "pending_broker_confirmation";

export interface ProviderInstrumentMapping {
  canonicalSymbol: string;
  provider: string;
  providerInstrument: string | null;
  status: InstrumentMappingStatus;
  source: string;
}

/**
 * Canonical symbols are resolved to provider-native identifiers.
 *
 * Fail-closed rule:
 * - only mappings with status="verified" may be resolved for a live provider request;
 * - pending mappings remain visible for governance/diagnostics but cannot be queried.
 */
export const PROVIDER_INSTRUMENT_MAPPINGS: readonly ProviderInstrumentMapping[] = [
  {
    canonicalSymbol: "BTCUSDT",
    provider: "binance",
    providerInstrument: "BTCUSDT",
    status: "verified",
    source: "Binance Spot symbol",
  },
  {
    canonicalSymbol: "EURUSD",
    provider: "saxo-sim",
    providerInstrument: "FxSpot:21",
    status: "verified",
    source: "Saxo OpenAPI EURUSD FxSpot UIC 21",
  },
  {
    canonicalSymbol: "EURUSD",
    provider: "ig-demo",
    providerInstrument: null,
    status: "pending_broker_confirmation",
    source: "IG Demo market identifier requires broker metadata confirmation",
  },
] as const;

function normalizeSymbol(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new Error("Canonical instrument symbol is required");
  return normalized;
}

function normalizeProvider(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error("Price provider id is required");
  return normalized;
}

export function getProviderInstrumentMapping(
  canonicalSymbol: string,
  provider: string,
): ProviderInstrumentMapping | undefined {
  const symbol = normalizeSymbol(canonicalSymbol);
  const providerId = normalizeProvider(provider);

  return PROVIDER_INSTRUMENT_MAPPINGS.find(
    (item) =>
      item.canonicalSymbol === symbol &&
      item.provider.trim().toLowerCase() === providerId,
  );
}

export function resolveProviderInstrument(
  canonicalSymbol: string,
  provider: string,
): string {
  const mapping = getProviderInstrumentMapping(canonicalSymbol, provider);

  if (!mapping) {
    throw new Error(
      `No provider instrument mapping for ${normalizeSymbol(canonicalSymbol)}/${normalizeProvider(provider)}`,
    );
  }

  if (mapping.status !== "verified" || !mapping.providerInstrument) {
    throw new Error(
      `Provider instrument mapping is not verified for ${mapping.canonicalSymbol}/${mapping.provider}`,
    );
  }

  return mapping.providerInstrument;
}
