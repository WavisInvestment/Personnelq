# Personnelq Platform

Psychometric assessment SaaS: a free 10-question snapshot, a paid 50-question Big Five (OCEAN) assessment, AI-written insights, PDF reports and shareable badges, for individuals and organisations.

Stack: NestJS API (`apps/api`), Next.js website (`apps/web`), PostgreSQL with Prisma.

## Start here

| I want to... | Read |
|---|---|
| See what is built, what is next, and which third-party accounts and keys are needed | [PROGRESS.md](PROGRESS.md) |
| Run the project on my machine | [docs/local-setup.md](docs/local-setup.md) |
| Put it on a server | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Learn the codebase and daily workflow | [docs/developer-guide.md](docs/developer-guide.md) |
| See the week-by-week schedule | [docs/implementation-plan.md](docs/implementation-plan.md) |

## Reference

- [docs/database-schema.md](docs/database-schema.md): all tables and relationships
- [docs/design/](docs/design/README.md): the 13 design areas (scope, flows, assessment engine, auth, payments, reports, security and more)
- [docs/reference/api-security-summary.md](docs/reference/api-security-summary.md): API security checklist

## Archive

Kept for history only; they describe past states, not today:

- [docs/archive/client-decisions.md](docs/archive/client-decisions.md): what the client decided and approved
- [docs/archive/planning-history.md](docs/archive/planning-history.md): planning-phase documents
- [docs/archive/build-history.md](docs/archive/build-history.md): dated status snapshots from the first weeks

## Testing
- API unit tests: `npm test` inside apps/api.
- Full end-to-end checks (API and browser, against fake payment, AI and email services): `node tests/e2e/run.js`. See [tests/e2e/README.md](tests/e2e/README.md).
- Every API route and who may call it: [docs/api-reference.md](docs/api-reference.md).
