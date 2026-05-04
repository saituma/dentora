# Dentora: AI Receptionist Generation Platform

## Project Overview
Dentora is a multi-tenant AI receptionist platform designed for dental clinics. It provides a 24/7 AI front desk that can handle calls, book appointments, and answer patient inquiries using a clinic-specific voice and policy set.

### Architecture Highlights
- **Multi-Tenant Isolation:** Strict isolation using `tenant_id` across database, runtime, and analytics boundaries.
- **Master AI Core:** A shared reasoning and orchestration engine that consumes tenant-specific configuration at runtime.
- **Versioned Configuration:** Clinic settings (profiles, booking rules, FAQs, voice profiles) are versioned (`config_version`), allowing for safe rollouts and rollbacks.
- **Telephony Integration:** Dedicated Twilio numbers per clinic for deterministic tenant resolution at call ingress.
- **AI Provider Orchestration:** A centralized Provider Selection Engine optimizes for cost, latency, and reliability across STT, TTS, and LLM providers.

### Tech Stack
- **Monorepo:** pnpm workspaces with Turborepo.
- **Backend (`apps/server`):** Express, TypeScript, Drizzle ORM, PostgreSQL, Redis (BullMQ), OpenTelemetry, Sentry.
- **Frontend (`apps/client`):** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Shadcn UI, Framer Motion, Redux Toolkit.
- **Admin Portal (`apps/admin`):** Next.js 16 (App Router), React 19, shadcn/ui (Sidebar), Biome (linting/formatting).
- **AI/Voice:** Twilio (Telephony), Deepgram (STT), ElevenLabs (TTS), OpenAI/Anthropic (LLM).

---

## Building and Running

### Prerequisites
- Node.js 20+ (Node.js 25 recommended)
- pnpm 10+
- Docker (for PostgreSQL and Redis)

### Initial Setup
1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Configure Environment Variables:**
   - Root: `cp .env.postgres.example .env.postgres`
   - Server: `cp apps/server/.env.example apps/server/.env`
   - Client: `cp apps/client/.env.local.example apps/client/.env.local`
   - Admin: (Check for `.env.example` in `apps/admin` if needed)
3. **Start Services:**
   ```bash
   pnpm db:up
   ```
4. **Initialize Database:**
   ```bash
   pnpm db:migrate
   ```

### Development Commands
- **Run all apps in parallel:** `pnpm dev`
- **Build all apps:** `pnpm build`
- **Type-check all workspaces:** `pnpm typecheck`
- **Database Management:**
  - Generate migrations: `pnpm db:generate`
  - Apply migrations: `pnpm db:migrate`
  - Open Drizzle Studio: `pnpm db:studio`

---

## Development Conventions

### Code Organization
- **Server:** Logic is divided into `src/modules`. Each module should handle its own routes, services, and business logic. Shared infrastructure resides in `src/db`, `src/lib`, `src/config`, and `src/middleware`.
- **Client/Admin:** Uses a feature-based structure in `src/features` (for client). Route entrypoints are kept thin in `src/app`. Reusable UI components are in `src/components`. Note that `apps/admin` uses **Biome** for linting and formatting.

### Tenant Isolation
- **Always** include `tenant_id` in database queries and event logging.
- Use row-level security (RLS) or explicit tenant scoping in service layers.
- Runtime session context must pin the `tenant_id` and `config_version` at the start of a call.

### Database Workflow (Drizzle)
- Schema definitions are located in `apps/server/src/db/schema.ts`.
- After modifying the schema, run `pnpm db:generate` to create a migration file.
- Apply migrations using `pnpm db:migrate`.

### Testing
- **Backend:** Uses Vitest. Tests are located alongside source files (`src/**/*.test.ts`). Run with `pnpm test`.
- **Telephony Simulation:** Use `pnpm simulate:twilio` and `pnpm simulate:twilio:media` in `apps/server` to test voice workflows without live Twilio calls.

### Observability
- All critical actions should be logged using the shared logger (`pino`).
- Use correlation IDs (`x-correlation-id`) to trace requests across telephony, AI, and integration layers.
- OpenTelemetry is used for tracing and metrics when `OTEL_ENABLED=true`.

---

## Key Files & Directories
- `apps/server/src/db/schema.ts`: Core data model definition.
- `apps/server/src/modules/telephony/`: Twilio webhook handlers and media stream processing.
- `apps/server/src/modules/llm/`: Master AI Core and receptionist logic.
- `apps/client/src/features/onboarding/`: Clinic onboarding and initial AI configuration flow.
- `context/`: Detailed architectural and domain documentation.
- `HIPAA_COMPLIANCE.md`: Security and privacy guidelines for clinical data.
