# YEAR95 — Architecture Decisions

## D1 — Decision authority

JEV is not an MVP authority.

The MVP decision path is deterministic:

price action + indicators + regime → Decision Engine → Risk Engine

JEV may return later behind a `SignalSource` port as an audited advisory input.

## D2 — Sizing semantics

`positionNotionalPct` and `riskPerTradePct` are separate concepts.

Current policy baseline:

- base position notional: 1.5% of equity;
- default risk per trade: 0.5%;
- hard maximum risk per trade: 1%.

The dynamic sizing component cannot bypass the hard risk cap.

## D3 — HTTP framework

YEAR95 uses Fastify for the API boundary.

Reasons:

- clean request lifecycle;
- strong schema integration;
- portable deployment model;
- no dependency on Vercel serverless conventions.

## D4 — User model

YEAR95 is multi-user by architecture.

MVP access is closed/allowlisted.

Supabase Auth is the identity provider.

Every protected application query is scoped by authenticated `userId`.

## D5 — Repository strategy

YEAR95 is a new repository created from zero.

The legacy ai-financial-analyst repository remains a read-only reference source.

No legacy code directory is built into the production runtime.

## D6 — Legacy baseline evidence

The architecture audit reports that `npm ci` and lint passed and that the remaining test scripts were executed separately after the aggregate test was manually interrupted. This is NOT treated as our independent full baseline.

Before declaring the legacy baseline authoritative, run and record:

`npm ci`
`npm run lint`
`npm run build`
`npm test` to completion

Record commit/ZIP hash and results.

## D7 — Database safety

Do not assume schema.sql equals the real Supabase database.

A read-only schema comparison is required before repository design.

No destructive migration during reconstruction.

New authorization/ownership structures are additive.

## D8 — Authorization boundary

Because the API uses a server-side PostgreSQL connection, repository methods must explicitly carry authenticated ownership context.

Supabase RLS is defense in depth, not the only authorization mechanism.

## D9 — Infrastructure independence

YEAR95 must run without Vercel-specific runtime dependencies.

No Vercel OIDC, Vercel AI Gateway, or Vercel cron is required for normal operation.

## D10 — First product milestone

The first meaningful milestone is:

login → API → Supabase → UI

Only after that E2E path is green do we proceed through:

BTCUSDT → market data → analysis → risk → paper signal.
