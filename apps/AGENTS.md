# Repository Guidelines

## Project Structure & Module Organization
This repository is organized as app-level packages under `apps/`:
- `client/`: Next.js 16 frontend (App Router). Main code lives in `client/src` with route groups like `src/app/(marketing)`, `src/app/(auth)`, and `src/app/dashboard`.
- `server/`: Express + TypeScript backend. Entry point is `server/src/index.ts`; feature modules live in `server/src/modules/*` with shared middleware in `server/src/middleware`.
- `admin/`: separate Next.js admin app with Biome for lint/format.
- `server/drizzle/`: SQL migrations and Drizzle metadata; schema source is `server/src/db/schema.ts`.

## Build, Test, and Development Commands
Use `pnpm` only.
- `pnpm --filter @repo/client dev`: run client locally.
- `pnpm --filter @repo/server dev`: run server with watch mode.
- `pnpm --filter @repo/client build` / `pnpm --filter @repo/server build`: production builds.
- `pnpm --filter @repo/client lint`: run frontend ESLint.
- `pnpm --filter @repo/server typecheck`: strict server TS check (`tsc --noEmit`).
- `pnpm --filter @repo/server test`: run server Vitest tests.
- DB workflow (server): `pnpm --filter @repo/server db:generate` then `pnpm --filter @repo/server db:migrate`.

## Coding Style & Naming Conventions
- Language: TypeScript across all apps.
- Linting: ESLint in `client/` and `server/`; Biome in `admin/`.
- Server imports must keep `.js` suffixes for relative ESM imports.
- Naming patterns: React components `PascalCase`; hooks `use-*.ts(x)`; service/route files `*.service.ts`, `*.routes.ts`; tests `*.test.ts`.

## Testing Guidelines
- Framework: Vitest in `server/` (`server/vitest.config.ts`), Node environment.
- Test files: `server/src/**/*.test.ts`.
- Coverage focus includes `src/lib/**`, `src/middleware/**`, and module `service`/`routes` files.
- Run coverage with `pnpm --filter @repo/server test:coverage`.

## Commit & Pull Request Guidelines
- Follow conventional-style prefixes seen in history: `feat:`, `fix:`, `debug:`.
- Keep commit subjects imperative and scoped (e.g., `fix: correct tenant filter for calls API`).
- PRs should include: clear summary, linked issue (if any), test evidence (commands/results), and screenshots for UI changes.

## Security & Configuration Tips
- Server environment is validated at startup (`server/src/config/env.ts`); set `DATABASE_URL` before running.
- Client API base URL should not include `/api` (it is appended in `client/src/lib/api.ts`).
