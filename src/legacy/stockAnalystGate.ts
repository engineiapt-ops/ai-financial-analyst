export const LEGACY_STOCK_ANALYST_PATHS = new Set([
  "/api/market/overview",
  "/api/analyze/ticker",
  "/api/analyze/ledger",
  "/api/valuation/dcf",
  "/api/research/memo",
  "/api/briefing/tts",
  "/api/copilot/chat",
]);

export function isLegacyStockAnalystEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ENABLE_STOCK_ANALYST === "true";
}

export function isLegacyStockAnalystPath(path: string): boolean {
  return LEGACY_STOCK_ANALYST_PATHS.has(path);
}
