import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const API_AUTH_TOKEN_HEADER = "X-API-Key";

export function isProtectedApiRequest(req: Request): boolean {
  if (!req.path.startsWith("/api/")) return false;

  if (req.path === "/api/analyze" && req.method === "POST") return true;
  if (req.method === "POST" && [
    "/api/analyze/ticker",
    "/api/analyze/ledger",
    "/api/valuation/dcf",
    "/api/research/memo",
    "/api/briefing/tts",
    "/api/copilot/chat",
  ].includes(req.path)) return true;
  if (req.path === "/api/report" && req.method === "POST") return true;
  if (req.path === "/api/product/research-intelligence" && req.method === "GET") return true;

  // Evaluation/governance endpoints expose run-scoped diagnostics or persist
  // governance history. Require the same API authentication used by other
  // non-public analytical endpoints.
  if (
    req.method === "GET" &&
    [
      "/api/evaluation/kpis",
      "/api/evaluation/oos-report",
      "/api/evaluation/pipeline-audit",
      "/api/product/governance-dashboard",
    ].includes(req.path)
  ) {
    return true;
  }
  if (
    req.method === "POST" &&
    [
      "/api/evaluation/pipeline-audit/snapshots",
      "/api/product/continuous-governance/check",
    ].includes(req.path)
  ) {
    return true;
  }
  if (req.path === "/api/system/validation/history" && req.method === "POST") return true;
  if (
    req.path.startsWith("/api/research/snapshots/") ||
    req.path.startsWith("/api/evaluation/decisions/")
  ) {
    return true;
  }
  if (req.path.startsWith("/api/backtest/")) return true;
  if (req.path === "/api/risk/regimes") return true;
  if (req.path.startsWith("/api/portfolio")) return true;

  return false;
}

function extractProvidedToken(req: Request): string | undefined {
  const apiKey = req.header(API_AUTH_TOKEN_HEADER);
  if (apiKey?.trim()) return apiKey.trim();

  const authorization = req.header("authorization");
  if (!authorization) return undefined;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function hasValidApiToken(req: Request, expectedToken = process.env.API_AUTH_TOKEN): boolean {
  const provided = extractProvidedToken(req);
  if (!provided || !expectedToken) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expectedToken);

  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireApiAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expectedToken = process.env.API_AUTH_TOKEN?.trim();

    if (!expectedToken) {
      res.status(503).json({
        status: "error",
        error: "API authentication is not configured",
      });
      return;
    }

    if (!hasValidApiToken(req, expectedToken)) {
      res.status(401).json({
        status: "error",
        error: "unauthorized",
      });
      return;
    }

    next();
  };
}
