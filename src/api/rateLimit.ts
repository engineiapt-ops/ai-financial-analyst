import type { NextFunction, Request, RequestHandler, Response } from "express";

interface WindowState {
  startedAt: number;
  count: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const windows = new Map<string, WindowState>();

  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new Error("Rate-limit window must be a positive finite number");
  }
  if (!Number.isFinite(options.max) || options.max <= 0) {
    throw new Error("Rate-limit max must be a positive finite number");
  }

  const pruneExpired = (now: number): void => {
    if (windows.size < 1024) return;
    for (const [key, window] of windows) {
      if (now - window.startedAt >= options.windowMs) {
        windows.delete(key);
      }
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    pruneExpired(now);

    const key = options.key(req);
    const current = windows.get(key);
    const state =
      !current || now - current.startedAt >= options.windowMs
        ? { startedAt: now, count: 0 }
        : current;

    state.count += 1;
    windows.set(key, state);

    const remaining = Math.max(options.max - state.count, 0);
    const resetAt = Math.ceil((state.startedAt + options.windowMs) / 1000);

    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetAt));

    if (state.count > options.max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((state.startedAt + options.windowMs - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        status: "error",
        error: "rate limit exceeded",
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    next();
  };
}

export function getRequestClientKey(req: Request): string {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const forwardedFor = req.header("x-forwarded-for");
    const firstForwarded = forwardedFor?.split(",")[0]?.trim();
    if (firstForwarded) return firstForwarded;
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

export function isHeavyApiRequest(req: Request): boolean {
  if (!req.path.startsWith("/api/")) return false;

  if (req.path === "/api/analyze" || req.path === "/api/report" || req.path === "/api/product/research-intelligence") return true;
  if (req.path.startsWith("/api/backtest/")) return true;
  if (req.path === "/api/portfolio/run" || req.path === "/api/portfolio/walk-forward") {
    return true;
  }
  if (req.path === "/api/risk/regimes") return true;
  if (req.path.startsWith("/api/evaluation/portfolio-")) return true;

  return false;
}
