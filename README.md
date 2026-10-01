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
npm ci
npm run build
npm test
npm run lint

# Desenvolvimento local
npm run dev

# Docker com a aplicação e PostgreSQL
docker compose up -d --build

# Produção local
NODE_ENV=production PORT=3000 npm start

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

The protected surface includes market analysis/report generation, research snapshot access, decision persistence, backtests, risk-regime analysis, portfolio operations and selected evaluation/governance routes. Read-only health, market connectivity and selected diagnostic evaluation endpoints remain accessible without the token.

The dashboard includes a session-only API key field for protected API requests; the key is sent only in the request header and is never stored in build-time environment variables or localStorage.
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

## Operational quality cockpit

The read-only `GET /api/evaluation/operational-quality` contract consolidates system readiness, live market-data freshness, quantitative governance, portfolio integrity and the paper-trading invariant. It is diagnostic only and does not produce or modify trading signals.


## Pipeline audit and traceability

The read-only `GET /api/evaluation/pipeline-audit?fromRun=<walkForwardRunId>` contract exposes `pipeline-audit.v1` for a persisted walk-forward run. It validates the traceability chain from dataset metadata to OOS gate evidence, portfolio governance, fold-stability coverage and execution-model registration.

The audit produces a deterministic SHA-256 evidence hash, explicit blocking reasons and non-blocking warnings. It does not create signals, change thresholds, select strategies or authorize live execution.

The module also exposes `comparePipelineAudits(previous, current)` for structural regression detection across snapshots. It identifies state regressions, OOS governance regressions, portfolio-integrity regressions, stability-coverage reductions, contract drift and expected dataset scope changes. Historical snapshot persistence is intentionally separated from this first read-only contract.

### Histórico do pipeline audit

O contrato `pipeline-audit.v1` pode ser persistido de forma imutável por `POST /api/evaluation/pipeline-audit/snapshots` com `fromRun`. Cada snapshot usa o `evidenceHash` como identidade idempotente e mantém o JSON completo da auditoria para reconstrução posterior.

`GET /api/evaluation/pipeline-audit/history?fromRun=<id>` retorna os snapshots históricos do walk-forward e calcula regressões estruturais entre estados consecutivos. Isso permite detectar degradação operacional, regressão OOS, perda de integridade do portfolio e redução de cobertura de estabilidade sem introduzir qualquer alteração de estratégia ou execução real.


## Governance Dashboard

The product layer exposes `GET /api/product/governance-dashboard` as the read-only governance cockpit. It consolidates system readiness, live market-data quality, evaluation/calibration, operational quality and, when `fromRun=<walk-forward-run-id>` is supplied, the current pipeline audit, historical audit snapshots, evidence hashes and dataset/OOS/portfolio/product traceability.

Example:

```text
GET /api/product/governance-dashboard?asset=BTCUSDT&timeframe=1h&fromRun=41
```

The `governance-dashboard.v1` contract explicitly preserves the product guardrails: paper trading only, deterministic Decision Engine authority, external AI/Gemini advisory-only, and dashboard read-only behavior. It does not rank strategies, select a preferred strategy, change thresholds, change sizing or authorize execution.

Pipeline audit construction now reuses the persisted `buildPipelineAuditForRun` service, avoiding duplicated scope-building logic between the read-only audit endpoint and the historical snapshot flow.


## System Validation

The operational layer exposes `GET /api/system/validation` as a consolidated release-readiness contract.

The `system-validation.v1` contract validates system readiness, market-data freshness, decision evaluation coverage, OOS governance, portfolio integrity, pipeline audit, continuous governance, research intelligence and outcome-settlement audit coverage for a selected scope. A supplied `fromRun` enables the walk-forward/OOS/portfolio governance checks; without it, those checks remain explicitly outside the requested scope.

Example:

```text
GET /api/system/validation?asset=BTCUSDT&timeframe=1h&fromRun=41
```

The contract is operational only: it does not create signals, alter thresholds or sizing, select strategies, authorize execution or treat research/sentiment as causal proof.

## Controlled JEV paper sampling

A scheduled read-only paper-analysis cycle can collect fresh JEV decision observations for BTCUSDT across the supported timeframes without placing real orders.

The cycle:
- analyzes only closed market candles;
- uses the existing deterministic Decision Engine, Risk Engine and persistence flow;
- records the JEV directional probability and confidence in the decision_log table;
- skips a timeframe when a JEV decision already exists for the current closed candle;
- never creates a real-order request.

Vercel triggers GET /api/cron/paper-jev-cycle once per day in the current deployment. The route requires the CRON_SECRET bearer token and remains disabled unless PAPER_JEV_AUTORUN=true is configured in the deployment environment. With the current daily scheduler, the 1h and 4h observations advance at most once per day; the 1d observation also advances once per invocation. This is a scheduling limitation, not a change to decision logic. See docs/JEV-CRON-CADENCE.md.

Required deployment configuration:
```env
CRON_SECRET=replace-with-a-random-secret
PAPER_JEV_AUTORUN=true
```

The first calibration target is to accumulate at least 30 valid settled directional observations before interpreting directional probability calibration metrics.

## Outcome Settlement Audit

Settled decision outcomes now produce an immutable `outcome-settlement-audit.v1` record. The audit links the decision log, evaluation timestamp, exact closed-candle evidence range, market-data SHA-256 hash, evaluation result and deterministic evidence hash.

Endpoints:
- `GET /api/evaluation/decisions/:decisionLogId/audit`
- `GET /api/evaluation/settlement-audit`

Settlement writes use an atomic transaction so the decision outcome and its audit record are committed together. A decision log can be finalized only once.

## Continuous outcome settlement

The evaluation layer exposes `POST /api/evaluation/decisions/settle-pending` to settle pending live decision logs once enough closed market candles are available. It uses the persisted market-data range, the existing deterministic `decisionEvaluator`, and the idempotent pending-only settlement write. Decisions that do not yet have enough future candles remain pending; failures are reported per decision and do not alter trading rules or paper-execution behavior.

Configuration is request-scoped:
`limit` (1-100), `ativo`, `timeframe`, `lookaheadCandles` (default 24), `flatThresholdPct` (default 0.1) and optional `evaluatedAt`.

## Continuous Governance

The product layer exposes deterministic continuous-governance checks around persisted pipeline-audit.v1 snapshots.

- GET /api/product/continuous-governance?fromRun=<id> evaluates the current scope without persisting a new snapshot.
- POST /api/product/continuous-governance/check persists an immutable snapshot idempotently and compares it with the previous evidence scope.

The continuous-governance.v1 contract provides temporal state history, evidence history, dataset-scope consistency, OOS traceability and contract-drift detection. Structural regressions are surfaced as governance events; they do not rank strategies, modify thresholds, modify sizing or authorize execution.


## Research Intelligence

The research layer now exposes `GET /api/product/research-intelligence?snapshotId=rs_...`.

The `research-intelligence.v1` contract enriches an existing persisted `research-snapshot.v1` with structured evidence traceability, source status, point-in-time validation, aggregate sentiment context, provenance-chain checks and a deterministic quality state. The intelligence endpoint reads the persisted snapshot; it does not trigger a new market decision or store mutable third-party content.

The endpoint is protected by API authentication and the heavy API rate limit. External research remains context-only: the deterministic quantitative Decision Engine remains authoritative, while research and Gemini context are advisory.


## Governance Cockpit 2.0 + Automated Release Gate

The dashboard now exposes a consolidated `System Validation Cockpit 2.0` backed by `system-validation.v1`. It shows the selected system state, counts of ready/degraded/blocked checks, blocking failures, settlement-audit coverage and the deterministic validation evidence hash.

The release pipeline now includes `release-gate.v1` after the full TypeScript build and aggregate test suite. The gate verifies that the release-critical governance contracts are present, that the aggregate test suite includes system validation and settlement-audit coverage, and that the product guardrails remain explicit: paper trading only, deterministic Decision Engine authority, AI/Gemini advisory-only and dashboard read-only.

The release gate does not create signals, rank strategies, change thresholds/sizing or authorize real execution.

## Validation History / Evidence Timeline

The system validation layer can now persist immutable `system-validation.v1` snapshots and expose a historical evidence timeline.

Endpoints:
- `GET /api/system/validation/history?asset=BTCUSDT&timeframe=1h&fromRun=41` reads persisted validation snapshots without mutating state.
- `POST /api/system/validation/history` explicitly records a new validation snapshot; the write endpoint requires API authentication.

The `validation-history.v1` contract validates temporal ordering, SHA-256 evidence hashes and scope consistency. Timeline events surface state changes, blocking-failure changes and evidence-hash changes between persisted snapshots.

The history is operational/audit evidence only. It does not rank strategies, change thresholds or sizing, produce investment verdicts or authorize execution.


## Supabase database access

The application uses the PostgreSQL connection configured in `DATABASE_URL` through the `pg` driver. It does not use the Supabase Data API or Supabase Auth roles from the application client. Migration `019_revoke_public_data_api_grants.sql` removes direct table, sequence and function privileges from the `anon` and `authenticated` roles and removes those grants from the PostgreSQL default privileges for future objects. This keeps database access server-side and avoids exposing application tables through Supabase's public Data API surface.\n