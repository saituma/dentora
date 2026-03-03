# System Architecture - Production Multi-Tenant AI Receptionist Platform

## Architecture Summary
This platform runs a **single Master AI Core** for all clinics and enforces strict tenant isolation using `tenant_id` across configuration, runtime, and analytics boundaries.

The production model separates resources into:
1. **Tenant-Specific Resources** (owned by each clinic)
2. **Shared Infrastructure Resources** (owned by the platform)

## Tenant-Specific Resources

Each clinic is a tenant and has dedicated, isolated assets:

- Dedicated Twilio phone number (inbound identity)
- Unique `tenant_id` (primary isolation key)
- Clinic configuration (profile, services, policies)
- Voice profile settings (`voice_id`, speed, tone)
- Booking rules
- Integrations (calendar, PMS/CRM)
- Isolated runtime memory and data (call logs, analytics, events)

### Tenant Isolation Rules
- Every tenant-owned table and event includes `tenant_id`.
- Every runtime request and service call is tenant-scoped.
- No cross-tenant session state, cache entries, or analytics query paths.
- Caches and queues use tenant namespace keys.

## Shared Infrastructure Resources

These components are centralized and shared globally across all tenants:

- TTS provider accounts (platform-owned)
- STT provider accounts (platform-owned)
- LLM provider accounts (platform-owned)
- Provider Selection Engine
- Voice Execution Engine
- Master AI Core logic

### Shared Resource Rules
- Clinics do **not** own separate TTS/STT/LLM accounts.
- Provider credentials are managed centrally by platform operations.
- Shared engines are stateless with tenant context injected per call.

## Layered Runtime Model

### Layer 1 - Master AI Core (Global)
Responsibilities:
- Intent understanding, workflow planning, and guardrail enforcement
- Tool orchestration for booking/cancellation/escalation workflows
- Response generation with policy constraints

Design rule:
- Stores no tenant business data directly; consumes tenant context payloads at runtime.

### Layer 2 - Tenant Configuration Context
Contains per-tenant, versioned artifacts:
- Clinic profile, services, and policies
- Voice profile configuration
- Booking rules
- Integration mappings and capability metadata

Versioning:
- `config_version` is immutable after publish.
- Runtime sessions pin active version at session start.
- Rollback activates a prior published version.

### Layer 3 - Runtime Session Context
Call-scoped state:
- `tenant_id`, `config_version`, and call correlation IDs
- Turn history, intent/confidence, and action trace
- Escalation state and final outcome

Lifecycle:
1. Initialize at call ingress
2. Update on each turn/action
3. Persist critical outcomes and analytics events
4. Expire ephemeral memory per retention policy

## Inbound Call Routing Model
1. Incoming call hits a dedicated Twilio number.
2. Number is mapped to `tenant_id`.
3. Active tenant configuration is loaded.
4. Runtime context is assembled and executed by shared AI/voice engines.

## Service Topology (Logical)
- API Gateway and Auth Service
- Tenant Configuration Service
- Call Routing and Session Service
- Master AI Orchestration Service
- Provider Selection Engine (global)
- Voice Execution Engine (global TTS/STT)
- Integration Service (PMS/Calendar/CRM adapters)
- Analytics and Cost Attribution Service
- Observability Stack (logs, metrics, traces, alerts)

## Reliability and Resilience
- Centralized provider failover with health-aware routing.
- Retry with backoff and dead-letter queues for external failures.
- Circuit breakers around unstable providers/integrations.
- Tenant-safe fallback paths: human transfer, callback queue, voicemail capture.

## Scalability Model
- Horizontal scaling by concurrent sessions, not tenant-specific AI stacks.
- Tenant-partitioned storage and analytics streams support thousands of clinics.
- Global provider pools optimize cost and utilization across all tenants.

## Compliance and Auditability
- Immutable audit logs for config changes and runtime decisions.
- Correlation IDs across telephony, AI, integrations, and billing events.
- Tenant-scoped access controls with row-level security and encryption.

## Core Architecture Decisions

| Decision | Rationale |
| --- | --- |
| Single Master AI Core with tenant context injection | Fast global improvements with strict isolation |
| Dedicated Twilio number per clinic | Deterministic tenant resolution at ingress |
| Centralized TTS/STT/LLM accounts | Lower cost, simpler operations, unified failover |
| Tenant-partitioned runtime + analytics | Production-grade SaaS isolation and governance |
| Versioned tenant configuration snapshots | Safe rollout, rollback, and reproducibility |
