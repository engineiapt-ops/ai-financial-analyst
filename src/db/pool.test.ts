import { strict as assert } from "node:assert";
import { createPool, resolveSsl } from "./pool.js";

const original = {
  nodeEnv: process.env.NODE_ENV,
  render: process.env.RENDER,
  ssl: process.env.DATABASE_SSL,
  ca: process.env.DATABASE_SSL_CA,
  max: process.env.DB_POOL_MAX,
  timeout: process.env.DB_STATEMENT_TIMEOUT_MS,
};

try {
  process.env.DATABASE_SSL = "disable";
  delete process.env.DATABASE_SSL_CA;
  assert.deepEqual(resolveSsl(), false);

  delete process.env.DATABASE_SSL;
  process.env.DATABASE_SSL_CA = "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----";
  assert.deepEqual(resolveSsl(), { ca: process.env.DATABASE_SSL_CA });

  delete process.env.DATABASE_SSL_CA;
  process.env.DATABASE_SSL = "require";
  assert.deepEqual(resolveSsl(), { rejectUnauthorized: false });

  delete process.env.DATABASE_SSL;
  process.env.RENDER = "true";
  assert.deepEqual(
    resolveSsl(),
    { rejectUnauthorized: false },
    "Render production must use PostgreSQL TLS by default",
  );

  process.env.DATABASE_SSL = "disable";
  process.env.DB_POOL_MAX = "7";
  process.env.DB_STATEMENT_TIMEOUT_MS = "5000";
  const pool = createPool("postgres://user:password@127.0.0.1:5432/test");
  const options = (pool as unknown as { options: Record<string, unknown> }).options;

  assert.equal(options.max, 7);
  assert.equal(options.idleTimeoutMillis, 30_000);
  assert.equal(options.connectionTimeoutMillis, 10_000);
  assert.equal(options.statement_timeout, 5_000);
  assert.equal(options.ssl, false);
  assert.equal(pool.listenerCount("error") > 0, true);

  await pool.end();

  assert.throws(
    () => createPool(""),
    /DATABASE_URL is required to create the PostgreSQL pool/,
  );
} finally {
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = original.nodeEnv;
  if (original.render === undefined) delete process.env.RENDER;
  else process.env.RENDER = original.render;
  if (original.ssl === undefined) delete process.env.DATABASE_SSL;
  else process.env.DATABASE_SSL = original.ssl;
  if (original.ca === undefined) delete process.env.DATABASE_SSL_CA;
  else process.env.DATABASE_SSL_CA = original.ca;
  if (original.max === undefined) delete process.env.DB_POOL_MAX;
  else process.env.DB_POOL_MAX = original.max;
  if (original.timeout === undefined) delete process.env.DB_STATEMENT_TIMEOUT_MS;
  else process.env.DB_STATEMENT_TIMEOUT_MS = original.timeout;
}

console.log("postgres pool tests: OK");
