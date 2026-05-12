# Contributing to Dentora

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker + Docker Compose (for local Postgres + Redis)

## Getting Started

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.local.example apps/client/.env.local
docker compose up -d
pnpm db:migrate
pnpm dev
```

## Development Workflow

1. Create a feature branch from `master`
2. Make changes with tests
3. Run `pnpm typecheck && pnpm lint && pnpm test` — all must pass
4. Push and open a PR against `master`

Pre-commit hooks (Husky + lint-staged) will run ESLint and `tsc --noEmit` automatically.

## Code Style

- TypeScript strict mode throughout
- No `any` — use proper types or `unknown` + narrowing
- No `console.log` — use the Pino logger (`import { logger } from '../../lib/logger.js'`)
- Drizzle ORM for all DB access — no raw SQL strings
- Every DB query must be scoped to `tenantId`

Run `pnpm format` to auto-format with Prettier before committing.

## Adding a New Module

```
apps/server/src/modules/<name>/
  <name>.service.ts   # Business logic — no Express types here
  <name>.routes.ts    # Route handlers — thin, delegate to service
```

Wire the router in `apps/server/src/index.ts`.

## Database Changes

```bash
# Edit apps/server/src/db/schema.ts
pnpm db:generate   # Creates migration file
# Review the generated SQL in apps/server/drizzle/
pnpm db:migrate    # Apply locally
```

Never use `drizzle-kit push` — it bypasses migration history.

## Writing Tests

Server tests live in `apps/server/src/**/*.test.ts` (Vitest). Integration tests use a real test database — set `TEST_DATABASE_URL` in your env.

Avoid mocking the database. The codebase has been burned by mock/prod divergence before.

## PHI Handling

Any new column storing patient-identifiable data (name, phone, address, health notes) must:

1. Use `encryptField()` on write and `decryptField()` on read (from `lib/encrypted-column.ts`)
2. Use `hashForSearch()` for a companion `*_hash` column if the field needs lookups
3. Call `req.audit()` in every route that reads or writes PHI

## Tenant Isolation

Every DB query must include `WHERE tenant_id = $tenantId`. The `resolveTenant` middleware sets `req.tenantContext`. Never trust `tenantId` from the request body — always use `req.tenantContext!.tenantId`.

## PR Checklist

- [ ] Tests added or updated
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] No new `any` types
- [ ] PHI in new columns is encrypted
- [ ] New DB queries include `tenantId` filter
- [ ] New PHI-reading routes call `req.audit()`
- [ ] DB schema changes have a migration file
