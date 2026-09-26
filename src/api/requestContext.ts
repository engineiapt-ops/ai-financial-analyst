import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);
  res.locals.requestId = requestId;
  next();
}
