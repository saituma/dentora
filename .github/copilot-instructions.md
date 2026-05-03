# Copilot instructions for this repository

Purpose
- Help Copilot sessions understand workspace layout, common scripts, and repo-specific conventions so suggestions stay relevant and actionable.

1) Build, test, and lint (how to run)
- Install deps (root):
  pnpm install

- Dev (run both):
  pnpm dev

- Build (root):
  pnpm build

- Typecheck (root):
  pnpm typecheck

- Start built apps (root):
  pnpm start

- Workspace-specific (use --filter):
  pnpm --filter @repo/client dev    # client dev server
  pnpm --filter @repo/client build  # client build
  pnpm --filter @repo/client lint   # run eslint for client
  pnpm --filter @repo/client typecheck

  pnpm --filter @repo/server dev   # server dev (tsx)
  pnpm --filter @repo/server build
  pnpm --filter @repo/server typecheck

- Database (local):
  pnpm db:up        # start Postgres (docker compose)
  pnpm db:migrate   # run drizzle migrations
  pnpm db:generate  # generate drizzle migration files
  pnpm db:push      # push schema with drizzle-kit
  pnpm db:check     # validate migration state

- Single test (pattern):
  If a package exposes a "test" script, run single test via:
    pnpm --filter @repo/<pkg> test -- -t "<test name or pattern>"
  (works with common runners that accept -t or pattern args; adjust flags for your test runner)

- CI notes (useful for suggestions):
  - CI pins NODE_VERSION=22 and PNPM_VERSION=9
  - CI installs with: pnpm install --frozen-lockfile
  - CI builds shared package first, lints client, typechecks server, then runs pnpm build

2) High-level architecture (big picture)
- Monorepo (pnpm workspace). Packages: apps/* and packages/*.
- Two primary apps:
  - apps/client: Next.js (App Router) frontend. Route entrypoints live in src/app; domain code belongs in src/features, components in src/components.
  - apps/server: Express API + Drizzle ORM. Domain modules live under src/modules; DB code under src/db. Routes should be thin and delegate to services.
- Shared code lives in packages (e.g., @repo/shared) and is built prior to app builds.
- Drizzle (drizzle-kit) manages schema + migrations; DB schema canonical source is apps/server/src/db/schema.ts.
- Local Postgres via docker-compose (.env.postgres used).
- Turbo is configured for task orchestration and caching (see turbo.json).

3) Key conventions & patterns
- Package naming: @repo/client, @repo/server, @repo/shared; use pnpm --filter to target workspaces.
- Keep route handlers thin: move business logic to features/services under apps/*/src/features or apps/server/src/modules.
- DB migrations: change schema in schema.ts -> pnpm db:generate -> pnpm db:migrate -> pnpm db:check.
- Client code: prefer components + features separation; don't put large business logic in route files.
- CI-specific: prefer pnpm install --frozen-lockfile and build shared packages first.

4) Files to consult when reasoning
- README.md (root): quick-start, scripts, env samples
- apps/client/* and apps/server/* package.json for per-package scripts
- apps/server/src/db/schema.ts for canonical DB schema
- turbo.json for pipeline/task shapes
- .github/workflows/ci.yml for CI expectations (Node/PNPM versions, steps)

5) Other AI assistant configs
- No CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, or AIDER_CONVENTIONS.md were found. If you add assistant-specific config files, include key directives here.

---

If you want this file expanded (more examples, single-command snippets, or workspace-specific quick-help sections), say which area to expand.
