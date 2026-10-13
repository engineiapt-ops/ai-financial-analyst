import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createDatabase } from "./database.js";

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function start(): Promise<void> {
  const env = process.env;
  const port = positiveInteger(env.PORT, 3000, "PORT");
  const host = env.HOST?.trim() || "0.0.0.0";
  const shutdownTimeoutMs = positiveInteger(env.SHUTDOWN_TIMEOUT_MS, 10_000, "SHUTDOWN_TIMEOUT_MS");
  const db = createDatabase(env);
  const app = await buildApp({ db, env });

  await app.listen({ port, host });

  let shutdownStarted = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    app.log.info({ signal }, "graceful shutdown started");
    const forceExit = setTimeout(() => {
      process.stderr.write(JSON.stringify({
        level: "fatal",
        event: "shutdown_timeout",
        message: "Graceful shutdown exceeded its deadline",
      }) + "\n");
      process.exit(1);
    }, shutdownTimeoutMs);
    forceExit.unref();

    try {
      await app.close();
      app.log.info({ signal }, "graceful shutdown completed");
    } catch {
      app.log.error({ signal }, "graceful shutdown failed");
      process.exitCode = 1;
    } finally {
      clearTimeout(forceExit);
    }
  };

  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
}

void start().catch(() => {
  process.stderr.write(JSON.stringify({
    level: "fatal",
    event: "api_start_failed",
    message: "API startup failed; verify runtime configuration",
  }) + "\n");
  process.exitCode = 1;
});
