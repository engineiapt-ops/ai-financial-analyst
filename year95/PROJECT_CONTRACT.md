# YEAR95 — Project Contract

## Identity

**Product:** YEAR95  
**Positioning:** AI Financial Intelligence

The new product is a clean reconstruction based on validated behavior and useful technical knowledge from the legacy ai-financial-analyst repository.

The legacy repository is a reference source only. It is not copied wholesale and it is not part of the YEAR95 runtime build.

## Product scope

Initial scope:

- market intelligence;
- deterministic quantitative analysis;
- risk assessment;
- signal generation;
- paper trading;
- evidence/audit;
- authenticated dashboard.

Initial market:

- BTCUSDT;
- 1h, 4h, 1d;
- closed-candle decisions.

## Hard invariants

1. No live order execution.
2. No live broker credentials in the browser.
3. Deterministic Decision Engine is authoritative.
4. AI is advisory-only.
5. Risk Engine is centralized.
6. Maximum risk per trade: 1%.
7. Minimum risk/reward: 1:2.
8. Invalid/stale/unverified market data fails closed.
9. `positionNotionalPct` is distinct from `riskPerTradePct`.
10. Base notional exposure is 1.5%; risk default is 0.5%; hard risk cap is 1%.
11. Supabase/PostgreSQL remains the persistence foundation.
12. Frontend and backend must be validated end-to-end early.
13. Every merge requires green CI for the required gates.
14. The normal runtime must not depend on Vercel.

## Architecture

Target dependency direction:

Frontend / HTTP
↓
Application services
↓
Domain
↓
Contracts / ports
↓
Adapters / persistence

Target applications:

- `apps/web` — React/Vite SPA;
- `apps/api` — Fastify API;
- `apps/worker` — background collection/paper cycles.

Target packages:

- contracts;
- domain;
- quant;
- risk;
- market-data;
- decision;
- paper-trading;
- ai;
- persistence;
- evaluation;
- backtest;
- research;
- portfolio;
- providers;
- config.

## Infrastructure

- Supabase: PostgreSQL + Auth;
- Render: API/worker initially;
- Cloudflare: DNS, domain and frontend/edge;
- Vercel: no architectural dependency.

## Authentication

Supabase Auth provides user identity.

The backend validates the JWT and derives `userId`.

Financial data access is server-side.

Repositories must enforce ownership using the authenticated user context. RLS may be added as defense in depth; it is not the sole authorization boundary when the backend uses a direct PostgreSQL connection.

## AI

Gemini is the first AI provider.

AI receives already-authorized deterministic analysis context.

The AI output type does not contain authority to change:

- side;
- threshold;
- sizing;
- execution permission.

Provider failure results in loss of narrative, not loss of deterministic analysis.

## Market data

Provider boundary:

`PriceProvider`

Initial adapter:

`BinancePriceProvider`

Only normalized, closed candles may enter decision paths.

Indicators are derived at calculation time and are not persisted as source market data.

## Database

No destructive migration is permitted during the reconstruction.

Before creating application repositories, perform a read-only comparison of:

- current Supabase schema;
- tracked migrations;
- schema.sql.

Any divergence becomes an explicit migration/ADR item.

## Testing

Tests are organized as:

- unit;
- contract;
- integration;
- critical E2E.

Release order:

typecheck
→ lint
→ unit
→ contract
→ integration
→ E2E
→ build

Behavior from the legacy system is ported as tests/contracts, not by copying implementation blindly.

## Change policy

A PR must have one primary responsibility.

Do not combine:

- architecture refactor + strategy change;
- provider migration + unrelated product feature;
- live-execution work + core reconstruction.

Every behavior change must be explicit and tested.

## Definition of Done for the initial foundation

The foundation is complete when YEAR95 has:

- documented architecture;
- repository boundaries;
- authentication contract;
- configuration contract;
- CI contract;
- dependency direction checks;
- no live-trading path;
- a clear migration rule from legacy behavior.

