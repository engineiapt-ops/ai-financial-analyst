# Testing

## Test layers

The repository uses four practical levels.

### Unit

Pure calculations and deterministic business rules.

Examples include:

- indicators;
- execution levels;
- risk/reward;
- position sizing;
- risk engine;
- option pricing.

### Contract

Provider and adapter contracts.

Examples include:

- price-provider implementations;
- instrument/provider mapping;
- authentication adapters;
- normalized market-data contracts.

### Integration

Boundaries that connect multiple modules or infrastructure components.

Examples include:

- API integration;
- repository behavior;
- market-data pipeline;
- persistence-backed governance.

### End-to-end

Complete user/system flows.

Examples include:

- paper trading E2E;
- paper cycle;
- full governance/release checks.

## Canonical commands

The aggregate suite is:

```bash
npm test
```

Specific suites are invoked with their `test:<name>` scripts in `package.json`.

The aggregate suite must remain a superset of all release-relevant test scripts. The `verify:test-manifest` guard fails when a `test:*` script is declared but omitted from `npm test`.

## Release validation

The release validation order is:

```
npm run lint
  ↓
npm run build
  ↓
npm test
  ↓
npm run release:gate
  ↓
GitHub CI
  ↓
Vercel deployment
```

A release is not considered structurally validated when only the TypeScript compiler passes.

## Determinism

Tests should avoid dependence on:

- wall-clock time;
- random values;
- external network calls;
- mutable process-global state.

When time is part of the behavior, inject a clock.

When an external provider is tested, inject a fetch/client implementation or use recorded fixtures.

## Financial safety assertions

Tests covering trading logic must assert fail-closed behavior for at least:

- `WAIT`;
- invalid price;
- stale market data;
- invalid risk inputs;
- risk/reward below 2;
- risk above 1%;
- unavailable provider;
- unverified instrument mapping.

## Point-in-time integrity

Backtest and OOS tests must preserve the point-in-time boundary.

A decision at timestamp `T` must not consume information newer than `T`.

## Test maintenance

When adding a new test script:

1. classify it as unit, contract, integration or E2E;
2. include it in the appropriate aggregate command;
3. keep its name stable;
4. document exceptional manual-only tests.

This prevents silent coverage gaps in the release pipeline.
