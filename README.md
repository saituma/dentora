# Full-Stack Starter Monorepo

A professional starter template for shipping full-stack features quickly with a consistent stack and structure.

## What This Template Includes

- `apps/client`: Next.js (App Router), TypeScript, Tailwind CSS
- `apps/server`: Express API, TypeScript, Drizzle ORM
- PostgreSQL 16 via Docker Compose
- pnpm workspace monorepo

## Tech Stack

- Node.js 20+ (tested with Node.js 25)
- pnpm 10+
- Next.js 16 + React 19
- Express + Drizzle ORM + `pg`
- PostgreSQL 16

## Project Structure

```text
.
├─ apps/
│  ├─ client/                  # Frontend
│  └─ server/                  # Backend API + DB layer
├─ docker-compose.yaml         # PostgreSQL service
├─ .env.postgres.example       # DB container env template
├─ pnpm-workspace.yaml
└─ README.md
```

## Use This Starter For a New Repository

Clone this starter and detach it from the original git history:

```bash
git clone https://github.com/sifenfisaha/fullstack-starter.git my-new-project
cd my-new-project
rm -rf .git
```

Initialize your own repository and push to your new remote:

```bash
git init
git add .
git commit -m "chore: initialize project from starter"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-new-repo>.git
git push -u origin main
```

## Quick Start

1. Install dependencies

```bash
pnpm install
```

2. Create local env files

```bash
cp .env.postgres.example .env.postgres
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.local.example apps/client/.env.local
```

3. Start PostgreSQL

```bash
pnpm db:up
```

4. Apply database migrations

```bash
pnpm db:migrate
```

5. Start the app

```bash
pnpm dev
```

Default local URLs:

- Client: `http://localhost:3000`
- API: `http://localhost:4000`

## Environment Configuration

### Root (`.env.postgres`)

Source: `.env.postgres.example`

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`

### Server (`apps/server/.env`)

Source: `apps/server/.env.example`

- `PORT`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `LOG_LEVEL`

### Client (`apps/client/.env.local`)

Source: `apps/client/.env.local.example`

- `NEXT_PUBLIC_API_URL`

## Scripts

### Root Commands

- `pnpm dev` - run client and server in parallel
- `pnpm build` - build client and server
- `pnpm typecheck` - type-check all workspaces
- `pnpm start` - start built client and server

Database:

- `pnpm db:up` - start PostgreSQL container
- `pnpm db:down` - stop PostgreSQL container
- `pnpm db:generate` - generate Drizzle migration files
- `pnpm db:migrate` - apply migrations
- `pnpm db:push` - push schema directly to DB
- `pnpm db:check` - validate migration state
- `pnpm db:studio` - open Drizzle Studio

### Workspace Commands

Server (`@repo/server`):

- `pnpm --filter @repo/server dev`
- `pnpm --filter @repo/server db:generate`
- `pnpm --filter @repo/server db:migrate`
- `pnpm --filter @repo/server db:push`
- `pnpm --filter @repo/server db:check`
- `pnpm --filter @repo/server db:studio`

Client (`@repo/client`):

- `pnpm --filter @repo/client dev`
- `pnpm --filter @repo/client lint`
- `pnpm --filter @repo/client typecheck`

## API Endpoints

- `GET /api/health` - API liveness and timestamp
- `GET /api/hello` - sample endpoint
- `GET /api/db-health` - database connectivity check

## Database Workflow (Drizzle)

When schema changes in `apps/server/src/db/schema.ts`:

1. Generate migration:

```bash
pnpm db:generate
```

2. Apply migration:

```bash
pnpm db:migrate
```

3. Verify state (optional):

```bash
pnpm db:check
```
