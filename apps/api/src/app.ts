import { randomUUID } from "node:crypto";
import Fastify, { LogController, type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { ReadinessDatabase } from "./database.js";

const RATE_LIMIT_WINDOW_MS = 60_000;

export interface RouteRateLimits {
  standard: { max: number; timeWindow: number };
  heavy: { max: number; timeWindow: number };
}

export type V1RouteRegistrar = (
  scope: FastifyInstance,
  limits: RouteRateLimits,
) => void | Promise<void>;

export interface BuildAppDependencies {
  db: ReadinessDatabase;
  env?: NodeJS.ProcessEnv;
  registerV1Routes?: V1RouteRegistrar;
}

class ApiHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "ApiHttpError";
  }
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseCorsOrigins(value: string | undefined): Set<string> {
  const origins = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      let url: URL;
      try {
        url = new URL(item);
      } catch {
        throw new Error("CORS_ORIGINS must contain valid HTTP(S) origins");
      }

      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== ""
      ) {
        throw new Error("CORS_ORIGINS must contain only exact HTTP(S) origins");
      }

      return url.origin;
    });

  return new Set(origins);
}

function sendApiError(
  reply: FastifyReply,
  requestId: string,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(statusCode).send({
    error: { code, message, requestId },
  });
}

export async function buildApp(deps: BuildAppDependencies): Promise<FastifyInstance> {
  const env = deps.env ?? process.env;
  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  const routeRateLimits: RouteRateLimits = {
    standard: {
      max: positiveInteger(env.RATE_LIMIT_MAX, 120, "RATE_LIMIT_MAX"),
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
    heavy: {
      max: positiveInteger(env.RATE_LIMIT_HEAVY_MAX, 20, "RATE_LIMIT_HEAVY_MAX"),
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
  };

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['set-cookie']",
          "req.headers['x-api-key']",
          "req.headers['x-auth-token']",
          "req.body.password",
          "req.body.token",
          "req.body.secret",
          "req.body.apiKey",
          "req.body.api_key",
          "res.headers['set-cookie']",
        ],
        censor: "[REDACTED]",
      },
    },
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    trustProxy: env.TRUST_PROXY === "true",
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    routerOptions: { ignoreTrailingSlash: true },
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.addHook("onClose", async () => {
    await deps.db.close?.();
  });

  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;

    if (error instanceof ApiHttpError) {
      sendApiError(reply, request.id, error.statusCode, error.code, error.publicMessage);
      return;
    }

    const status = (error as Error & { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const notFound = status === 404;
      const rateLimited = status === 429;
      sendApiError(
        reply,
        request.id,
        status,
        notFound ? "NOT_FOUND" : rateLimited ? "RATE_LIMIT_EXCEEDED" : "INVALID_REQUEST",
        notFound ? "Route not found" : rateLimited ? "Rate limit exceeded" : "Request could not be processed",
      );
      return;
    }

    request.log.error(
      { requestId: request.id, errorCode: (error as Error & { code?: string }).code ?? "INTERNAL_ERROR" },
      "unhandled API error",
    );
    sendApiError(reply, request.id, 500, "INTERNAL_ERROR", "Internal server error");
  });

  app.setNotFoundHandler((request, reply) => {
    sendApiError(reply, request.id, 404, "NOT_FOUND", "Route not found");
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }

      if (!allowedOrigins.has(origin)) {
        callback(new ApiHttpError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed"));
        return;
      }

      callback(null, origin);
    },
    credentials: false,
    strictPreflight: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: routeRateLimits.standard.max,
    timeWindow: routeRateLimits.standard.timeWindow,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => {
      const error = new Error("Rate limit exceeded") as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = context.statusCode;
      error.code = context.statusCode === 429 ? "RATE_LIMIT_EXCEEDED" : "RATE_LIMIT_BANNED";
      return error;
    },
  });

  app.get("/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
  }));

  app.get("/ready", { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await deps.db.ping();
      return { status: "ready" };
    } catch {
      request.log.warn({ requestId: request.id }, "readiness check failed");
      return sendApiError(
        reply,
        request.id,
        503,
        "DATABASE_UNAVAILABLE",
        "Readiness check failed",
      );
    }
  });

  await app.register(async (scope) => {
    scope.get("/", async () => ({ data: { version: "v1" } }));
    await deps.registerV1Routes?.(scope, routeRateLimits);
  }, { prefix: "/v1" });

  await app.ready();
  return app;
}
