# Provider Selection Engine - Global Shared Infrastructure

## Purpose
Define centralized provider routing for STT, TTS, and LLM workloads across all tenants in a production multi-tenant SaaS platform.

## Ownership Model
- Provider accounts are shared globally by the platform.
- Clinics (tenants) do not own separate TTS/STT/LLM accounts.
- Selection and failover logic is centralized and policy-driven.

## Engine Inputs
For each request, the engine receives:
- `tenant_id` (for attribution and policy context)
- workload type (`stt`, `tts`, `llm`)
- language and modality requirements
- quality/SLA requirements
- compliance constraints
- current provider health telemetry
- current pricing and usage-rate telemetry

## Selection Strategy
The engine computes a score per qualified provider using:
- **Cost**: effective unit economics for requested operation
- **Latency**: expected p50/p95 response latency
- **Reliability**: recent success rate, timeout rate, and error rate

Priority rule:
- Select the **cheapest qualified provider** that still satisfies latency, reliability, and compliance thresholds.

## Qualification Gates
A provider is only eligible if:
- Capability supports request (language, voice, feature set)
- Health status is not failing
- Reliability is above minimum threshold
- Estimated latency meets SLA tier
- Compliance constraints are satisfied

Providers that fail any gate are excluded before scoring.

## Centralized Failover Logic
Failover is platform-managed and applies uniformly across tenants:
1. Detect timeout/error/circuit-breaker conditions.
2. Mark provider temporarily degraded for relevant workload region.
3. Re-run selection among remaining qualified providers.
4. Retry with bounded attempts and idempotency controls.
5. Emit failover events for observability and incident workflows.

Failover principles:
- No tenant-specific provider account switching.
- No manual per-clinic failover trees in normal operation.
- Shared incident state prevents repeated routing to unstable providers.

## Cost and Attribution
- Provider usage is billed at platform account level.
- Usage is attributed back to call/session and `tenant_id` for analytics and billing.
- Engine emits selected provider metadata for each operation.

## Telemetry and Feedback Loop
The engine continuously updates routing decisions using:
- live provider health checks
- rolling latency and reliability windows
- effective blended cost by operation type
- regional outage signals

Telemetry outputs:
- provider selected
- selection reason vector (cost/latency/reliability)
- fallback count
- final operation outcome

## Integration with Master AI Runtime
- Master AI Core requests provider choices through this engine.
- Voice Execution Engine consumes selected providers for STT/TTS.
- LLM runtime uses selected LLM provider for inference.
- All request/response paths preserve `tenant_id` for isolation and attribution.

## Scalability and SaaS Readiness
- Stateless selection workers support horizontal autoscaling.
- Shared provider account model avoids per-tenant operational sprawl.
- Centralized policy updates propagate immediately to all tenants.
- Designed for thousands of clinics with consistent reliability behavior.

## Explicit Non-Goals
- No per-tenant TTS account ownership model.
- No per-tenant STT account ownership model.
- No per-tenant LLM account ownership model.
