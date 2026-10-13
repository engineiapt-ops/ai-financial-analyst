import { Pool } from "pg";

export interface ReadinessDatabase {
  ping(): Promise<void>;
  close?(): Promise<void>;
}

export function createDatabase(env: NodeJS.ProcessEnv = process.env): ReadinessDatabase {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 3_000,
    max: 4,
    idleTimeoutMillis: 10_000,
  });

  return {
    async ping(): Promise<void> {
      if (!env.DATABASE_URL?.trim()) {
        throw new Error("DATABASE_URL is not configured");
      }

      await pool.query("SELECT 1");
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
