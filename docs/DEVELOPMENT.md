# Development

## Runtime contract

The project is standardized on:

- Node.js 22;
- npm 10.x;
- TypeScript with strict checking;
- ES modules;
- `package-lock.json` as the dependency lockfile.

Use the repository's `.nvmrc` before installing dependencies.

## Reproducible setup

```bash
npm ci
npm run db:migrate
npm run build
npm test
```

Do not use `npm install` for normal CI/release reproduction because it can modify the lockfile.

## Local development

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run dev
```

The application expects the environment variables documented in `.env.example`.

Never commit `.env`, credentials, API tokens or broker secrets.

## Change discipline

Keep pull requests small and single-purpose.

A structural pull request should avoid introducing unrelated features.

Before opening a pull request:

```bash
npm run lint
npm run build
npm test
npm run release:gate
```

For behavior-sensitive changes, also run the most specific test suite for the affected module.

## Layering rules

- HTTP route code stays in `src/api`.
- Domain rules stay outside HTTP handlers.
- External broker/exchange calls stay behind provider adapters.
- SQL stays inside repository modules.
- Quantitative calculations should remain deterministic and side-effect free where practical.
- Configuration is read and validated at explicit configuration boundaries.
- AI output is untrusted input until structurally validated.

## Naming

Use names that distinguish financial concepts precisely.

For example:

- `riskPerTradePct` = percentage of equity at risk;
- `positionNotionalPct` = notional exposure as a percentage of equity;
- `stopDistancePct` = price distance between entry and stop.

Avoid overloaded names such as `sizePct` when the financial meaning is ambiguous.

## Time handling

Persist and compare timestamps as explicit `Date` values at domain boundaries.

For point-in-time analysis, make the `dataAsOf` timestamp explicit and never use future observations to calculate a decision.

## Error handling

Errors crossing external boundaries should include:

- provider/module context;
- a safe message;
- the original error as `cause` where supported.

Do not expose credentials, authorization headers or raw secret-bearing request bodies.

## Testing

Prefer deterministic unit tests for calculations and pure functions.

Use contract tests for provider adapters.

Use integration tests for database/API boundaries.

Use end-to-end tests for complete paper-trading paths.

## Git workflow

Use a short-lived branch from `main`.

A pull request should be mergeable independently.

Do not combine a refactor with a strategy change unless the refactor is required to safely implement that change.

## Rollback

Every production-impacting change should be reversible through:

- a previous Git commit;
- a previous Vercel deployment;
- or an explicit database migration rollback/recovery procedure where applicable.
