# AGENTS

## Working defaults for this repo
- Use `pnpm` for everything (workspace + CI are pnpm-based).
- Treat this as a monorepo: `apps/client` (Next.js 16), `apps/server` (Express + Drizzle), `packages/shared` (shared schemas/constants).
- Prefer `pnpm --filter <pkg> <script>` for focused work in one package.

## High-value commands
- Install: `pnpm install --frozen-lockfile`
- Dev (both apps): `pnpm dev`
- Dev (single app): `pnpm --filter @repo/client dev` or `pnpm --filter @repo/server dev`
- Build all: `pnpm build`
- Typecheck all: `pnpm typecheck`
- CI-like quality checks: `pnpm --filter @repo/client lint` then `pnpm --filter @repo/server exec tsc --noEmit`

## Environment + services gotchas
- Server env is strictly validated in `apps/server/src/config/env.ts`; `DATABASE_URL` must be set or server exits at startup.
- Local DB helper scripts only start Postgres (`pnpm db:up`); Redis is a separate compose service and is optional in local dev (server continues with degraded/in-memory cache behavior if Redis is unavailable).
- Client API base URL must not include a trailing `/api`; `apps/client/src/lib/api.ts` appends `/api` automatically.

## Database / Drizzle workflow
- Schema source of truth: `apps/server/src/db/schema.ts`.
- After schema changes: run `pnpm db:generate` then `pnpm db:migrate` (optional: `pnpm db:check`).
- Migration artifacts live in `apps/server/drizzle/` and should be committed with schema changes.
- CI also does a migration dry run using `drizzle-kit push` against a temporary Postgres service.

## Code structure and entrypoints
- Server entrypoint: `apps/server/src/index.ts` (mounts all module routers, health endpoints, metrics, and attaches WebSocket handlers for telephony + receptionist live sessions).
- Server modules are organized under `apps/server/src/modules/*` with `index.ts` re-exports used by `src/index.ts`.
- Client uses App Router route groups under `apps/client/src/app` (`(marketing)`, `(auth)`, `dashboard`, `onboarding`) and Redux Toolkit state/apis wired in `apps/client/src/store/index.ts`.

## TypeScript/ESM quirk on server
- Keep `.js` suffixes in server TypeScript relative imports (Node16 ESM setup). Using extensionless imports in `apps/server` will break runtime output.

## CI/deploy facts that affect changes
- CI order is effectively: install -> client lint + server typecheck -> full build -> migration dry run.
- Production deploy workflow runs DB migrations during deploy (`drizzle-kit push`) before restarting services.
