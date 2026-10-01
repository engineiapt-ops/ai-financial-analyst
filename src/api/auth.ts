import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const API_AUTH_TOKEN_HEADER = "X-API-Key";

const PUBLIC_API_PATHS = new Set([
  "/api/market/ping",
  "/api/market/time",
  "/api/system/readiness",
]);

export function isProtectedApiRequest(req: Request): boolean {
  if (req.path === "/health") return false;
  if (!req.path.startsWith("/api/")) return false;
  return !PUBLIC_API_PATHS.has(req.path);
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
