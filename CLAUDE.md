# CLAUDE.md — AI Agent Guide for Dentora

Dentora is a **production multi-tenant UK dental SaaS** running an AI phone receptionist. Patient data is UK GDPR-regulated. Every change touches a live system serving real dental patients.

---

## Prime directive

Act as a senior systems engineer, production software architect, and strict TypeScript reviewer.  
Protect the system. Prioritise in this order:

1. **Correctness** — does it work?
2. **Security** — does it leak data or create vulnerabilities?
3. **Tenant isolation** — is `tenantId` scoped everywhere?
4. **Reliability** — does it fail gracefully?
5. **Type safety** — does TypeScript agree?
6. **Minimal change** — smallest safe diff that solves the problem
7. **Maintainability** — will the next engineer understand it?

Do **not** behave like a code generator that immediately edits files. First understand the system, then make the smallest safe change. Never claim a change is complete unless it has been implemented and verified.

---

## Monorepo layout

```
apps/
  client/    Next.js 16 (App Router) — patient-facing dashboard
  server/    Express 5 + Drizzle ORM — API + worker
  admin/     Next.js 16 — internal admin portal (Biome for lint/fmt)
packages/
  shared/    Shared types and constants
```

Use `pnpm` for everything. Target workspaces with `--filter`:

```bash
pnpm --filter @repo/server dev
pnpm --filter @repo/client build
pnpm --filter @repo/shared typecheck
```

---

## Essential commands

```bash
# Install
pnpm install --frozen-lockfile

# Dev (all apps in parallel)
pnpm dev

# Build
pnpm build

# Typecheck all
pnpm typecheck

# Server tests
pnpm --filter @repo/server exec vitest run

# Database
pnpm db:up        # start Postgres via Docker
pnpm db:migrate   # apply migrations (drizzle-kit)
pnpm db:generate  # generate migration from schema changes
pnpm db:studio    # open Drizzle Studio

# Lint
pnpm --filter @repo/server exec eslint src/
pnpm --filter @repo/client exec eslint src/
# admin uses Biome:
pnpm --filter @repo/admin exec biome check .
```

---

## Architecture quick-reference

### Server modules (`apps/server/src/modules/`)

| Module          | Responsibility                                                              |
| --------------- | --------------------------------------------------------------------------- |
| `auth/`         | JWT + refresh tokens, Google OAuth, MFA (TOTP), password reset              |
| `telephony/`    | Twilio webhooks, WebSocket media stream, call lifecycle                     |
| `ai/`           | LLM orchestration, provider failover (OpenAI → Anthropic), circuit breakers |
| `patients/`     | Patient profiles (AES-256-GCM encrypted), GDPR erasure, DSAR export         |
| `calls/`        | Call sessions, transcripts, events, cost attribution                        |
| `config/`       | Clinic profile, services, booking rules, FAQs, voice profile (Redis-cached) |
| `integrations/` | Google Calendar OAuth + availability                                        |
| `appointments/` | Booking logic, availability queries                                         |
| `analytics/`    | Call analytics, usage metrics                                               |
| `tenants/`      | Tenant registry, plan management                                            |

### Key libraries (`apps/server/src/lib/`)

| File                  | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `encrypted-column.ts` | `encryptField/decryptField` (AES-256-GCM) + `hashForSearch` (HMAC-SHA256) |
| `circuit-breaker.ts`  | 5-failure threshold, 30s reset, wraps all external AI/Twilio calls        |
| `retry.ts`            | Exponential backoff with jitter for transient errors                      |
| `queue.ts`            | BullMQ — DLQ on exhausted retries, OTel spans on all jobs                 |
| `cache.ts`            | `tenantCacheGet/Set/Del`, `tenantCacheInvalidateDomain`                   |
| `metrics.ts`          | Prometheus metrics + Datadog custom business metrics                      |
| `telemetry.ts`        | OpenTelemetry SDK (OTLP → Datadog Agent on port 4318)                     |
| `logger.ts`           | Pino with dd.trace_id/dd.span_id injection, PII redaction                 |

### DB schema (`apps/server/src/db/schema.ts`)

Canonical source of truth. Change schema → `pnpm db:generate` → `pnpm db:migrate`.

Encrypted columns (AES-256-GCM): `patientProfiles.fullName`, `patientProfiles.phoneNumber`, `patientProfiles.notes`, `callSessions.callerNumber`, `callSessions.intentSummary`, `callTranscripts.summary`.

Hash columns for lookups: `patientProfiles.phoneNumberHash`, `callSessions.callerNumberHash`.

---

## Tenant isolation rules

- **Every** DB query must include `eq(table.tenantId, tenantId)`.
- `resolveTenant` middleware pins `req.tenantContext.tenantId` from JWT.
- Never use a `tenantId` from the request body — always from JWT or phone→tenant mapping.
- Cache keys use `tenant:{tenantId}:{domain}:{id}` format.

---

## UK GDPR rules (enforced in code)

- PHI is encrypted at rest — never log or expose plaintext patient names/phones/DOB.
- All patient/call read and write operations call `req.audit?.()` for the audit log.
- `DELETE /api/patients/:id` triggers GDPR Article 17 cascade deletion.
- `GET /api/patients/:id/export` produces GDPR Article 15/20 data export.
- Data retention: transcripts 2 years, audit logs 7 years (enforced by worker cron).

---

## Testing

- Server: Vitest. Tests live at `apps/server/src/**/*.test.ts`.
- E2E: Playwright at `e2e/`. Run with `pnpm --filter @repo/client exec playwright test`.
- Pre-commit: Husky + lint-staged runs ESLint + Prettier on changed files.
- CI: TypeScript + tests + lint must pass before deploy.

---

## Database migrations

1. Edit `apps/server/src/db/schema.ts`
2. `pnpm db:generate` — creates migration file in `apps/server/drizzle/`
3. Review the generated SQL
4. `pnpm db:migrate` — applies it locally
5. Commit both `schema.ts` and the migration file

**Never use `drizzle-kit push` in production.** Migrations run via `drizzle-kit migrate` at deploy time.

---

## Deployment

Production: DigitalOcean LON1 Droplet via SSH + Docker Compose.  
Triggered by: CI passing on `master` → `deploy.yml` workflow.

```bash
# On the server (manually if needed)
cd /opt/dental-flow
git pull origin master
docker compose -f docker-compose.prod.yaml pull
docker compose -f docker-compose.prod.yaml up -d --remove-orphans
```

Services: `postgres`, `redis`, `server`, `worker`, `client`, `nginx`, `certbot`, `datadog-agent`.

---

## Common gotchas

- `__dirname` works (CJS output). `import.meta.url` does **not** — the server compiles to CommonJS.
- `req.user` has `userId`, `tenantId`, `role` — no `email`. Fetch email via `authService.getUserAccountInfo()`.
- The `etag()` middleware must come before `res.json()` calls to intercept them.
- `listCallSessions` returns `{ items, nextCursor, hasMore }` — not a plain array.
- Config service caches reads for 5 min; call `tenantCacheInvalidateDomain(tenantId, 'config')` after any config write.
- BullMQ workers (`apps/server/src/worker.ts`) run in a separate container — don't import worker code into the API server.
