import pg from "pg";

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveSsl(): false | { ca: string } | { rejectUnauthorized: false } {
  if (process.env.DATABASE_SSL === "disable") {
    return false;
  }

  const ca = process.env.DATABASE_SSL_CA?.trim();
  if (ca) {
    return { ca };
  }

  if (process.env.DATABASE_SSL === "require") {
    return { rejectUnauthorized: false };
  }

  const productionLike =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RENDER);

  if (productionLike) {
    console.warn(
      "DATABASE_SSL_CA is not configured; using rejectUnauthorized=false for production PostgreSQL TLS. Configure the Supabase CA for certificate verification.",
    );
    return { rejectUnauthorized: false };
  }

  return false;
}

export function createPool(connectionString: string): pg.Pool {
  if (!connectionString.trim()) {
    throw new Error("DATABASE_URL is required to create the PostgreSQL pool");
  }

  const pool = new pg.Pool({
    connectionString,
    max: Math.floor(envNumber("DB_POOL_MAX", 5)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: Math.floor(envNumber("DB_STATEMENT_TIMEOUT_MS", 30_000)),
    ssl: resolveSsl(),
  });

  pool.on("error", (err) => {
    console.error(
      JSON.stringify({
        event: "pg_idle_client_error",
        message: err.message,
      }),
    );
  });

  return pool;
}

let defaultPool: pg.Pool | null = null;

export function getDefaultPool(): pg.Pool {
  if (!defaultPool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for repository operations");
    }
    defaultPool = createPool(connectionString);
  }
  return defaultPool;
}

export async function closePool(): Promise<void> {
  if (!defaultPool) return;
  const pool = defaultPool;
  defaultPool = null;
  await pool.end();
}

export function resetPoolForTests(): void {
  defaultPool = null;
}
