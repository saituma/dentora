# Voice Call Architecture - Production Multi-Tenant Runtime

## Purpose
Define how an inbound call is resolved to a tenant, executed with centralized AI providers, and cost-attributed per call in a production SaaS environment.

## Core Principles
- Single Master AI Core serves all tenants.
- Tenant isolation is enforced through `tenant_id` at every runtime boundary.
- Every clinic has a dedicated Twilio number for deterministic tenant resolution.
- TTS/STT/LLM providers are centralized platform resources.
- Provider selection is cost-, latency-, and reliability-aware.
- Full per-call cost tracking is required.

## End-to-End Runtime Flow

## 1) Inbound Telephony and Tenant Resolution
1. Twilio sends inbound webhook with called number and call SID.
2. Platform performs lookup in `twilio_numbers` by `phone_number_e164`.
3. Matching record returns `tenant_id`.
4. System creates `call_sessions` row with pinned `tenant_id` and correlation IDs.

Failure handling:
- If no mapping exists, route to safe fallback queue and emit critical incident event.

## 2) Tenant Configuration Load
Using resolved `tenant_id`:
1. Load active `config_version` from `tenant_active_config`.
2. Load tenant configuration snapshot:
   - clinic profile
   - services
   - booking rules
   - policies
   - voice profile (`voice_id`, speed, tone)
   - integration metadata
3. Validate completeness before first AI turn.

Guardrails:
- Missing critical config triggers controlled escalation path.
- Runtime never loads another tenant’s config.

## 3) Provider Selection and Voice Execution
For each call/turn requiring AI media processing:
1. Provider Selection Engine receives request context (task type, language, SLA, compliance constraints).
2. Engine scores globally shared providers using:
   - effective cost
   - expected latency
   - reliability/health status
3. Engine selects cheapest qualified provider set that meets constraints.
4. Voice Execution Engine performs:
   - STT using selected shared STT account
   - LLM inference using selected shared LLM account
   - TTS using selected shared TTS account

Notes:
- Clinics do not own separate TTS/STT/LLM accounts.
- Selection and failover policy is centralized at platform level.

## 4) Conversation and Action Loop
Per turn:
1. Transcribe caller audio (STT).
2. Execute Master AI Core planning and policy checks.
3. Run tools/integrations in tenant scope.
4. Render response audio (TTS) using tenant-selected voice profile.
5. Persist event and state updates with `tenant_id`.

## 5) Cost Tracking Per Call
At runtime and call completion:
- Capture STT, TTS, LLM, and telephony usage metrics.
- Write tenant-attributed totals to `call_costs`.
- Emit cost and quality events for analytics and billing.

Cost model requirements:
- One finalized cost record per call session.
- Cost breakdown by provider and modality.
- Aggregations always scoped by `tenant_id`.

## Runtime Components
- Twilio Ingress Handler
- Number-to-Tenant Resolver
- Tenant Config Loader
- Master AI Core Runtime
- Provider Selection Engine (global)
- Voice Execution Engine (global)
- Tenant Integration Orchestrator
- Call Session and Event Store
- Cost Attribution Service
- Observability Pipeline

## Isolation and Security Controls
- Mandatory `tenant_id` in runtime context envelope.
- Tenant-scoped DB reads/writes and cache keys.
- Correlation IDs across Twilio, AI, integrations, and costs.
- Immutable audit trail for critical call actions and escalations.

## Scalability Profile
- Stateless runtime workers scale horizontally by concurrent calls.
- Shared provider pools reduce account sprawl and increase utilization.
- Tenant-partitioned persistence supports thousands of clinics without cross-tenant leakage.

## Production Outcomes
- Deterministic tenant routing from dedicated phone numbers.
- Consistent global provider optimization for cost and resilience.
- Strong tenant isolation with platform-level operational efficiency.
