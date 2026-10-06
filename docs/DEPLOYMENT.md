# Deployment

## Environments

The system must distinguish these environments:

- local development;
- CI;
- Vercel production;
- broker SIM;
- broker LIVE.

Broker environment and application environment are not interchangeable.

## Current execution invariant

The deployed application is paper-trading only.

There is currently no approved automated live order path.

## Standard release path

```
feature branch
   ↓
pull request
   ↓
GitHub CI
   ↓
build + aggregate tests + release gate + Docker build
   ↓
merge to main
   ↓
Vercel production deployment
   ↓
post-deploy health/readiness validation
```

## Reproducibility baseline

The repository pins the Node.js toolchain to **22.23.3** across the local runtime declaration, GitHub Actions and Docker.

Docker base images are pinned by immutable OCI manifest digest:

- Node.js 22.23.3 Alpine for application build/runtime;
- PostgreSQL 16 Alpine for the local Compose database.

The dependency graph is resolved exclusively through `package-lock.json` with `npm ci`.

GitHub Actions uses the fixed Ubuntu 24.04 runner image and immutable commit references for the checkout/setup-node actions used by the validation workflow.

When updating any pinned runtime, action or container image, record the new version/digest in the same change and keep the CI, Docker and local Node references aligned.

## Required release checks

A release should show:

- TypeScript checks passing;
- production build passing;
- aggregate test suite passing;
- release gate passing;
- Docker build passing;
- Vercel deployment ready.

## Runtime configuration

Production configuration is supplied through environment/secret management.

Never hard-code:

- database credentials;
- API tokens;
- broker credentials;
- AI provider secrets.

Configuration validation must fail closed for malformed critical settings.

## Database

Migrations are applied through:

```bash
npm run db:migrate
```

Migration files are ordered numerically and recorded in `schema_migrations`.

Database changes must be backward compatible with the application version being deployed whenever a rolling deployment is possible.

## Rollback

Application rollback should prefer restoring the previous known-good Git/Vercel deployment.

Database rollback requires an explicit recovery procedure for the affected migration and data shape; do not assume a schema rollback is safe merely because the application can be reverted.

## Broker progression

The broker progression is:

```
Saxo read-only market data
        ↓
real-data paper/shadow
        ↓
Saxo SIM execution
        ↓
operational reconciliation
        ↓
explicit LIVE safety gate
        ↓
controlled manual real test
```

No stage is skipped.

## Operational evidence

Each stage should retain evidence sufficient to reproduce the decision:

- application version/commit;
- provider/environment;
- instrument mapping;
- market-data timestamp;
- data quality state;
- decision;
- risk assessment;
- execution intent/result when applicable;
- test/release status.

## Secrets

Secrets must only appear in:

- local environment files excluded by Git;
- CI secret storage;
- Vercel secret/environment configuration;
- broker/provider secret management.

Logs must not contain secrets or authorization headers.
