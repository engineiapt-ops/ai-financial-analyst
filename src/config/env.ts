export type ConfigEnv = Record<string, string | undefined>;

export function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseEnvNumber(
  value: string | undefined,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const trimmed = trimEnvValue(value);
  if (trimmed === undefined) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  if (options.min !== undefined && parsed < options.min) return undefined;
  if (options.max !== undefined && parsed > options.max) return undefined;

  return parsed;
}

export function parseEnvBoolean(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized === "") return undefined;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

export function parseStrictBoolean(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized === "") return undefined;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

export function parseEnvUrl(
  value: string | undefined,
  protocols: readonly string[],
): URL | undefined {
  const trimmed = trimEnvValue(value);
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    return protocols.includes(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}
