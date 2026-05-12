# Architecture

## System overview

Dentora is a **multi-tenant SaaS** platform where each clinic (tenant) gets its own AI receptionist configuration. All tenants share the same infrastructure but are isolated at the data, cache, and job-queue level via `tenantId`.

```
┌──────────────────────────────────────────────────┐
│                  Cloudflare (free)               │
│         DDoS protection · CDN · WAF             │
└────────────────────┬─────────────────────────────┘
                     │ HTTPS
┌────────────────────▼─────────────────────────────┐
│            Nginx (DigitalOcean LON1)             │
│  HTTPS termination · ip_hash sticky sessions    │
│  Cloudflare real IP restore · rate limiting     │
└──────┬───────────────────────────┬───────────────┘
       │                           │
┌──────▼──────┐           ┌────────▼───────┐
│ client:3000 │           │  server:3001   │
│  Next.js 16 │           │  Express 5 API │
│  (dashboard)│           │  + WebSocket   │
└─────────────┘           └────────┬───────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
       ┌──────▼──────┐   ┌────────▼───────┐   ┌───────▼──────┐
       │  PostgreSQL  │   │     Redis      │   │  BullMQ      │
       │  (primary)   │   │  cache · rate  │   │  Worker      │
       │  + replica   │   │  limit · queue │   │  (separate   │
       └─────────────┘   └───────────────┘   │   container) │
                                              └─────────────┘
```

---

## Call flow (inbound voice)

```
Caller → Twilio PSTN → /api/telephony/webhook/voice
  → tenant resolved (Twilio number → tenantId via Redis cache)
  → call session created in Postgres
  → TwiML redirect to WebSocket media stream

WebSocket: /api/telephony/media-stream
  → Deepgram STT (real-time audio → text)
  → AI Engine (OpenAI / Anthropic LLM with circuit breaker)
  → ElevenLabs TTS (text → audio)
  → Twilio media stream (audio back to caller)
  → call events + cost attribution → BullMQ jobs
```

---

## Multi-tenancy

| Layer     | Isolation mechanism                                                      |
| --------- | ------------------------------------------------------------------------ |
| Database  | `WHERE tenant_id = $1` on every query; enforced in service layer         |
| Cache     | Keys prefixed `tenant:{tenantId}:{domain}:{id}`                          |
| BullMQ    | Every job carries `tenantId`; workers validate before processing         |
| WebSocket | Session pinned to `tenantId` + `configVersionId` at connect time         |
| JWT       | `tenantId` embedded in access token; `resolveTenant` middleware enforces |
| Twilio    | Dedicated phone number per clinic → deterministic tenant resolution      |

---

## PHI encryption (UK GDPR)

Patient health information is **encrypted at rest** with AES-256-GCM before writing to Postgres. The plaintext never touches the database.

| Column                               | Encryption  | Purpose              |
| ------------------------------------ | ----------- | -------------------- |
| `patient_profiles.full_name`         | AES-256-GCM | Encrypted at rest    |
| `patient_profiles.phone_number`      | AES-256-GCM | Encrypted at rest    |
| `patient_profiles.phone_number_hash` | HMAC-SHA256 | Deterministic lookup |
| `patient_profiles.notes`             | AES-256-GCM | Encrypted at rest    |
| `call_sessions.caller_number`        | AES-256-GCM | Encrypted at rest    |
| `call_sessions.caller_number_hash`   | HMAC-SHA256 | Deterministic lookup |
| `call_sessions.intent_summary`       | AES-256-GCM | Encrypted at rest    |
| `call_transcripts.summary`           | AES-256-GCM | Encrypted at rest    |

Key: `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes). Rotation via `apps/server/scripts/rotate-secrets.ts`.

---

## AI provider architecture

```
AI Engine
  └── executeLlmWithFailover()
        ├── Primary: OpenAI gpt-4o
        ├── Fallback: Anthropic Claude
        └── Circuit breaker per provider
              (5 failures → open, 30s reset → half-open probe)

STT: Deepgram (real-time streaming) → circuit breaker
TTS: ElevenLabs → circuit breaker
Telephony: Twilio → webhook idempotency via Redis SET NX
```

All external calls are also wrapped in `withRetry()` (exponential backoff, 10% jitter, 3 attempts).

---

## Caching strategy

| Data                                                                 | TTL   | Invalidation         |
| -------------------------------------------------------------------- | ----- | -------------------- |
| Tenant config (clinic profile, services, booking rules, FAQs, voice) | 5 min | On any config write  |
| Phone → tenantId mapping                                             | 24 h  | On number assignment |
| Twilio webhook idempotency                                           | 24 h  | Never (TTL expiry)   |
| Active config version                                                | 5 min | On publish           |

Cache client: ioredis. Falls back to in-memory Map when `REDIS_DISABLED=true` (dev only).

---

## Background jobs (BullMQ)

| Queue                   | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `cost-attribution`      | Attribute AI provider costs to call sessions  |
| `analytics-events`      | Process call events for analytics aggregation |
| `integration-callbacks` | Google Calendar webhooks                      |
| `notification-delivery` | Transactional emails via Resend/SMTP          |
| `config-validation`     | Validate clinic config completeness           |
| `daily-aggregation`     | Nightly usage rollup                          |
| `dead-letter`           | Exhausted jobs (3 retries) — logged + alerted |

Worker runs as a separate container (`apps/server/src/worker.ts`) so job processing doesn't compete with HTTP request handling.

---

## Observability

| Signal  | Tool                                               | Destination                  |
| ------- | -------------------------------------------------- | ---------------------------- |
| Traces  | OpenTelemetry (HTTP + Express + BullMQ spans)      | Datadog Agent → Datadog EU   |
| Metrics | Prometheus (`/metrics`) + prom-client              | Datadog Agent via OTLP       |
| Logs    | Pino JSON (+ `dd.trace_id`/`dd.span_id` injection) | Datadog Agent log collection |
| Errors  | Sentry (`@sentry/node`)                            | Sentry                       |
| Uptime  | Datadog Synthetic Monitor                          | PagerDuty on-call            |

Dashboard: `datadog/dashboards/dentora-overview.json` — import via Datadog UI.

---

## Deployment pipeline

```
git push master
  → GitHub Actions CI (typecheck + test + lint)
  → On success: deploy.yml SSH to DigitalOcean LON1
      → docker compose pull (new images from GHCR)
      → rolling restart (server + worker + client)
      → health check: /api/health/ready
      → rollback if health check fails
```

Secrets stored in GitHub Actions environment `production`. Never in the repo.

---

## Data residency

All services run in **DigitalOcean LON1 (London)**. Patient data never leaves the UK at rest. Third-party processors (Twilio, ElevenLabs, OpenAI, Deepgram) have signed DPAs with UK IDTA transfer mechanisms — see `docs/compliance/dpa-tracker.md`.
