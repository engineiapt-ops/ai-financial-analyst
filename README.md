# AI Financial Analyst

MVP pessoal de análise financeira assistida por IA.

## Escopo travado
- BTC/USD
- Timeframes: 1h, 4h e 1D
- Paper trading apenas
- Jev com versão fixada
- Baseline sem Jev
- Position sizing fixo e conservador
- Thresholds congelados antes de OOS

## Playlist de implementação
1. Setup & Infra
2. Schema do Banco
3. Ingestão de Mercado
4. Feature Engine
5. Pipeline de Sentimento
6. Adapter Jev
7. Decision Engine + Sizing
8. Baseline
9. Paper Trading
10. Repository
11. API
12. Backtest Jev x Baseline

## Desenvolvimento
cp .env.example .env
npm install
npm run build
docker compose up -d --build

Health:
GET /health

O MVP não executa ordens reais.

## Online analysis, provenance and Gemini

The product layer exposes:
- `POST /api/online-analysis` for the complete online pipeline: quantitative decision, point-in-time research, persisted snapshot and provenance packet.
- `GET /api/ai/providers` for configured AI provider status without exposing secrets.

Gemini is integrated through a provider-agnostic interface. The deterministic quantitative decision remains authoritative; Gemini only adds contextual narrative, risk flags and watch items.

Configuration:
```env
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_API_BASE=https://generativelanguage.googleapis.com/v1beta
GEMINI_TIMEOUT_MS=30000
```

The current Gemini adapter uses the official REST `generateContent` API and structured JSON output. See the Google Gemini API documentation for the current API contract and model availability. The default model in this project is `gemini-3.8-flash`.

The dashboard at `/` now surfaces decision state, market-data freshness, snapshot provenance, packet identity and optional Gemini contextual analysis.

## Quantitative quality cockpit

The product dashboard also exposes `GET /api/evaluation/overview`, which consolidates decision-quality KPIs, confidence calibration and recent OOS validation-gate audits for the selected asset/timeframe. This layer is diagnostic/governance-only: it does not alter strategy thresholds or produce a new trading signal.

## Portfolio governance overview

The product API exposes `GET /api/evaluation/portfolio-overview?fromRun=<walk-forward-run-id>` to consolidate account-level portfolio walk-forward validation and regime diagnostics. This layer is read-only/diagnostic and does not select a preferred strategy or alter trading rules.

## System readiness

The API exposes `GET /api/system/readiness` as a read-only operational check for market connectivity, database availability, configured AI providers, paper-only execution mode, and governance contract presence.
## API hardening

The API now assigns a unique `X-Request-ID` to every request and applies an in-memory rate limit to API routes. The default limit is 120 requests per minute per client, with a stricter 20 requests per minute limit for analysis, report, backtest, portfolio and risk-regime endpoints.

Configuration:
```env
TRUST_PROXY=false
RATE_LIMIT_MAX=120
RATE_LIMIT_HEAVY_MAX=20
```

Set `TRUST_PROXY=true` only when the deployment is behind a trusted reverse proxy that provides `X-Forwarded-For`. The limiter is intentionally dependency-free and process-local; it is a best-effort protection layer and is not a substitute for a distributed rate limiter at the edge.
## API authentication

Sensitive endpoints now require an API token. Send it either as `X-API-Key` or as `Authorization: Bearer <token>`.

Configuration:
```env
API_AUTH_TOKEN=replace-with-a-random-secret
```

The protected surface includes market analysis/report generation, research snapshot access, decision persistence, backtests, risk-regime analysis and portfolio operations. Read-only health, market connectivity and evaluation endpoints remain accessible without the token.

The dashboard includes a session-only API key field for `/api/analyze`; the key is sent only in the request header and is not persisted server-side.
## Observability

The API emits structured JSON request logs with request ID, method, path, HTTP status and latency. Unhandled errors are logged with the same request ID and return a generic error response without exposing internal details.

Configuration:
```env
OBSERVABILITY_LOGS=true
```

Logging can be disabled with `OBSERVABILITY_LOGS=false`. Logs never include request bodies, API keys or provider secrets.
## Runtime configuration readiness

The readiness contract now validates deployment configuration without exposing secrets.

In production/Vercel, `DATABASE_URL` and `API_AUTH_TOKEN` are required. Optional integrations such as Gemini are reported as warnings when absent, while malformed URLs, booleans or numeric limits are reported as invalid configuration.

This check is read-only and does not change strategy, thresholds, sizing or execution.\n\n## Portfolio stability diagnostics\n\nThe portfolio walk-forward report now exposes portfolio-stability.v1 metrics per strategy, derived only from persisted out-of-sample folds. The diagnostics include fold-count, positive/non-negative fold frequency, return mean/median/dispersion, best/worst fold, drawdown dispersion, median Sharpe/Sortino and closed-trade coverage.\n\nThese fields are descriptive and governance-only. They do not rank strategies, change thresholds, size positions or authorize live execution.\n