# API shell

Standalone HTTP API package. This service intentionally contains no market, decision, or paper-trading routes.

## Local development

Use Node.js 22 and npm 10:

```sh
cd apps/api
npm install
npm test
npm run build
npm start
```

The server listens on `0.0.0.0:3000` by default.

## Runtime configuration

- `PORT`: HTTP port, default `3000`.
- `HOST`: bind address, default `0.0.0.0`.
- `DATABASE_URL`: PostgreSQL connection string; required for `GET /ready`.
- `CORS_ORIGINS`: comma-separated exact HTTP(S) origins. Empty means browser origins are denied.
- `RATE_LIMIT_MAX`: standard limit per IP per minute, default `120`.
- `RATE_LIMIT_HEAVY_MAX`: heavy-route limit per IP per minute, default `20`.
- `LOG_LEVEL`: Pino/Fastify log level, default `info` (or `silent` for tests).
- `TRUST_PROXY`: set to `true` only when the service is behind a trusted proxy.
- `SHUTDOWN_TIMEOUT_MS`: graceful shutdown deadline, default `10000`.

`GET /health` checks process liveness only. `GET /ready` executes `SELECT 1` and responds with 503 when the database is unavailable. API routes belong under `/v1`; add business routes through the injected route registrar, not by nesting another application.

## Docker

From the repository root:

```sh
docker build -f apps/api/Dockerfile -t ai-financial-analyst-api:local .
docker run --rm -p 3000:3000 -e DATABASE_URL="$DATABASE_URL" ai-financial-analyst-api:local
```
