import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../server.ts", import.meta.url),
  "utf8",
);

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  source.includes("import { closePool } from './src/db/pool.js';"),
  "root server must close the shared PostgreSQL pool",
);
assert(
  source.includes("server.close"),
  "shutdown must stop accepting new connections before exit",
);
assert(
  source.includes("process.once('SIGTERM'"),
  "SIGTERM must trigger graceful shutdown",
);
assert(
  source.includes("process.once('SIGINT'"),
  "SIGINT must trigger graceful shutdown",
);
assert(
  source.includes("SHUTDOWN_TIMEOUT_MS"),
  "shutdown must have a bounded timeout",
);
assert(
  source.includes("forceExit.unref()"),
  "shutdown timeout must not keep the process alive",
);
assert(
  source.includes("shuttingDown"),
  "shutdown must be idempotent against duplicate signals",
);
assert(
  source.includes("startServer()"),
  "root server must remain the single production entrypoint",
);

console.log("graceful shutdown tests: OK");

const createAppSource = readFileSync(
  new URL("./createApp.ts", import.meta.url),
  "utf8",
);
assert(
  createAppSource.includes("server.keepAliveTimeout = 70_000"),
  "HTTP keep-alive timeout must exceed 65 seconds",
);
assert(
  createAppSource.includes("server.headersTimeout = 75_000"),
  "HTTP headers timeout must exceed keep-alive timeout",
);
