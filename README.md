# Dentora

AI-powered phone receptionist for dental clinics. Handles inbound calls via Twilio, transcribes speech with Deepgram, reasons with OpenAI/Anthropic, and responds via ElevenLabs TTS — all in real time.

Multi-tenant SaaS: each clinic gets its own AI receptionist configuration, phone number, and data isolation. All patient data is encrypted at rest (AES-256-GCM) and processed under UK GDPR / DPA 2018.

## Architecture

```
Cloudflare → Nginx (LON1) → Express API + WebSocket
                          → PostgreSQL (primary + replica)
                          → Redis (cache + rate limit + queue)
                          → BullMQ Worker (separate container)
```

Full diagram and call flow in [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech Stack

| Layer          | Choice                                               |
| -------------- | ---------------------------------------------------- |
| Frontend       | Next.js 16, React 19, Tailwind CSS, TypeScript       |
| API            | Express 5, TypeScript, Drizzle ORM                   |
| Database       | PostgreSQL 16 (primary + read replica)               |
| Cache / Queue  | Redis 7 + BullMQ                                     |
| AI             | OpenAI GPT-4o (primary), Anthropic Claude (failover) |
| STT            | Deepgram real-time streaming                         |
| TTS            | ElevenLabs                                           |
| Telephony      | Twilio                                               |
| Observability  | OpenTelemetry → Datadog (EU), Sentry, Pino           |
| Infrastructure | DigitalOcean LON1, Cloudflare, Docker Compose        |

## Monorepo Layout

```
apps/
  client/           Next.js dashboard (port 3000)
  server/           Express API + BullMQ worker (port 3001)
    src/
      modules/      Domain logic (auth, calls, patients, config, ...)
      db/           Drizzle schema + migrations
      lib/          Shared infra (encryption, cache, queue, metrics, ...)
      middleware/   JWT auth, tenant resolution, audit, rate limiting
      worker.ts     BullMQ worker entrypoint (separate container)
nginx/              Nginx config (HTTPS, sticky sessions, Cloudflare IPs)
docs/
  runbooks/         On-call playbooks
  compliance/       DPA tracker, GDPR notes
datadog/dashboards/ Versioned Datadog dashboard JSON
load-tests/         k6 scripts (API + voice)
```

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker + Docker Compose

### Setup

```bash
# Install dependencies
pnpm install

# Copy env templates
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.local.example apps/client/.env.local

# Start PostgreSQL + Redis
docker compose up -d

# Run migrations
pnpm db:migrate

# Start everything
pnpm dev
```

- Dashboard: http://localhost:3000
- API: http://localhost:4000
- API health: http://localhost:4000/api/health

### Key env vars (server)

| Variable                            | Description                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                      | PostgreSQL connection string                                              |
| `DATABASE_REPLICA_URL`              | Read replica (optional, falls back to primary)                            |
| `REDIS_URL`                         | Redis connection string                                                   |
| `ENCRYPTION_KEY`                    | 64 hex chars (32 bytes) for AES-256-GCM. Generate: `openssl rand -hex 32` |
| `JWT_SECRET`                        | 128 hex chars. Generate: `openssl rand -hex 64`                           |
| `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` | Twilio credentials                                                        |
| `OPENAI_API_KEY`                    | Primary LLM                                                               |
| `ANTHROPIC_API_KEY`                 | Failover LLM                                                              |
| `DEEPGRAM_API_KEY`                  | Speech-to-text                                                            |
| `ELEVENLABS_API_KEY`                | Text-to-speech                                                            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`       | OpenTelemetry collector (default: Datadog agent)                          |
| `SENTRY_DSN`                        | Error tracking                                                            |

## Common Commands

```bash
pnpm dev                  # Start client + server in parallel
pnpm build                # Build all workspaces
pnpm typecheck            # Type-check all workspaces
pnpm test                 # Run all tests
pnpm lint                 # ESLint across all workspaces
pnpm format               # Prettier across all workspaces

pnpm db:generate          # Generate Drizzle migration from schema changes
pnpm db:migrate           # Apply pending migrations
pnpm db:studio            # Open Drizzle Studio
```

## Database Migrations

**Never use `drizzle-kit push` in production.** Use the migration workflow:

```bash
# 1. Edit apps/server/src/db/schema.ts
# 2. Generate migration
pnpm db:generate

# 3. Review generated SQL in apps/server/drizzle/
# 4. Apply
pnpm db:migrate
```

Migrations run automatically on server startup in production via `migrate()` in `apps/server/src/db/index.ts`.

## Testing

```bash
pnpm --filter @repo/server test           # Server unit + integration tests
pnpm --filter @repo/server test:coverage  # With coverage report
pnpm --filter @repo/client test           # Client tests
npx playwright test                       # E2E tests (requires running app)
```

Coverage thresholds enforced in CI: 50% lines/functions.

## PHI Encryption

All patient data is encrypted before reaching PostgreSQL:

- `patient_profiles`: `full_name`, `phone_number`, `notes` — AES-256-GCM
- `call_sessions`: `caller_number`, `intent_summary` — AES-256-GCM
- `call_transcripts`: `summary` — AES-256-GCM
- Phone number lookups use HMAC-SHA256 hash columns (deterministic, non-reversible)

The `ENCRYPTION_KEY` env var must be exactly 64 hex characters. Rotation procedure: `apps/server/scripts/rotate-secrets.ts`.

## Deployment

Production runs on DigitalOcean LON1 (UK data residency). Deployments trigger automatically when CI passes on `master`:

```
git push master → GitHub Actions CI → SSH deploy → docker compose pull → rolling restart → health check
```

Rollback: the deploy script exits non-zero if the health check fails, leaving the previous containers running. To manually roll back, SSH and run `docker compose -f docker-compose.prod.yaml up -d --no-deps server worker client` with the previous image tag.

See [ARCHITECTURE.md](ARCHITECTURE.md) for full deployment pipeline.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and the full list of security controls.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
