import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface ApiLogRecord {
  event: "http_request" | "http_error";
  requestId: string;
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  contentLength?: string | undefined;
  error?: string;
}

function enabled(): boolean {
  const value = process.env.OBSERVABILITY_LOGS?.trim().toLowerCase();
  return value !== "false";
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

export function logApiEvent(record: ApiLogRecord): void {
  if (!enabled() || process.env.NODE_ENV === "test") return;
  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...record,
  }) + "\n");
}

export const requestObservabilityMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const requestId = String(res.locals.requestId ?? "unknown");
    const status = res.statusCode;

    logApiEvent({
      event: "http_request",
      requestId,
      method: req.method,
      path: req.path,
      status,
      durationMs: Number(durationMs.toFixed(2)),
      contentLength: res.getHeader("content-length")?.toString(),
    });
  });

  next();
};

export function requestErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = String(res.locals.requestId ?? "unknown");
  const message = safeErrorMessage(error);

  logApiEvent({
    event: "http_error",
    requestId,
    method: req.method,
    path: req.path,
    status: 500,
    error: message,
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).json({
    status: "error",
    error: "internal server error",
    requestId,
  });
}
