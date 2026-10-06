# Architecture

## Purpose

AI Financial Analyst is a TypeScript application for deterministic market analysis, paper-trading validation, research support, portfolio diagnostics and governance evidence.

The current production invariant is:

- paper trading only;
- deterministic quantitative decision is authoritative;
- AI providers are advisory;
- the dashboard is read-only from a trading perspective;
- live order routing is not part of the current runtime.

## Architectural boundaries

The repository is organized by responsibility rather than by framework feature.

```
src/
  api/            HTTP routes, middleware and request orchestration
  ai/             AI provider adapters and AI-facing services
  backtest/       Backtest and walk-forward computation
  config/         Runtime and strategy configuration
  db/             PostgreSQL persistence and migrations
  decision/       Deterministic decision engines
  evaluation/     Decision, OOS and performance evaluation
  features/       Deterministic feature/indicator calculations
  instruments/    Canonical instrument registry and provider mappings
  jev/            JEV client integration
  marketdata/     Market-data ports, providers, normalization and quality
  options/        Vanilla and barrier option calculations
  papertrading/   Paper-only execution and validation
  portfolio/      Portfolio simulation and governance
  product/        Read-only governance and product contracts
  quant/          Reusable quantitative primitives
  research/       Research and evidence pipelines
  risk/           Risk policy and risk-engine logic
  signals/        Signal construction and execution gates
```

## Dependency direction

The preferred dependency direction is:

```
HTTP / UI
   ↓
Application orchestration
   ↓
Domain logic
   ↓
Ports / interfaces
   ↓
Infrastructure adapters
```

Domain and quantitative modules should not depend directly on broker SDKs, HTTP clients or database connection details.

## Market-data boundary

The target market-data path is:

```
Application
   ↓
MarketDataService
   ↓
PriceProviderRegistry
   ↓
PriceProvider
   ↓
Broker / exchange adapter
```

Provider-specific identifiers must be resolved through the instrument/provider mapping layer.

## Risk boundary

Risk decisions must be centralized in the Risk Engine.

The following are hard safety invariants:

- maximum risk per trade is never greater than 1% of equity;
- minimum risk/reward is 1:2;
- invalid or stale market data fails closed;
- unverified provider/instrument mappings fail closed;
- risk blocks must result in no executable signal.

Position notional percentage and risk percentage are distinct concepts and must remain distinct in types, function names and persistence.

## Paper-trading boundary

Paper trading is an explicit boundary:

```
Decision
  → confluence
  → executable signal
  → risk
  → paper validation
```

No paper-trading module should require a live broker order dependency.

## Persistence boundary

Database access belongs in repository modules. Application services should depend on repository contracts instead of embedding SQL throughout HTTP handlers.

## AI boundary

AI should be consumed through provider abstractions. Provider responses must be validated before becoming typed application data.

The deterministic quantitative decision remains authoritative. AI-generated narrative must never silently modify thresholds, sizing or execution permission.

## API boundary

HTTP controllers/routes should validate transport input, invoke application services and translate domain errors to safe HTTP responses.

They should not contain indicator calculations, broker protocol details or large SQL operations.

## Change policy

Structural refactors must preserve behavior unless the pull request explicitly declares a behavior change.

Preferred refactoring sequence:

1. introduce the new boundary;
2. add tests for the boundary;
3. migrate callers;
4. remove the obsolete path;
5. validate build, tests and release gate;
6. deploy and compare behavior.

This order keeps changes reversible and limits regression scope.

## Broker boundary

Broker connectivity is separate from market-data transport.

The Saxo broker adapter is intentionally read-only. Its contract exposes account discovery and account detail only; order placement, modification and cancellation are not part of the contract.

Saxo environments are explicit: SIM and LIVE. Construction of a LIVE read-only client fails closed unless `SAXO_ENABLE_LIVE_READ_ONLY=true` is explicitly configured.

No credentials or access tokens are logged. Market-data providers remain separate from broker account access, and instrument resolution remains under `src/instruments`.
