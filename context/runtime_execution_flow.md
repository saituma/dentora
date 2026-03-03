# Runtime Execution Flow - Patient Call to Outcome

## Purpose
Define the production runtime sequence for handling inbound patient calls using the Master AI with tenant-specific context injection.

## Runtime Goals
- Respond quickly and consistently for every inbound call.
- Enforce booking and policy logic deterministically.
- Escalate safely when confidence or policy requires.
- Emit complete logs and analytics for every decision and action.

## End-to-End Call Lifecycle

## 1) Call Ingress and Tenant Resolution
1. Telephony provider sends inbound call webhook.
2. Platform resolves `tenant_id` from called number mapping.
3. Call session is initialized with correlation IDs.
4. Active tenant configuration version is fetched and pinned.

Failure path:
- If tenant resolution fails, route to generic fallback and log critical incident.

## 2) Context Assembly
Runtime context injector builds a composite context object:
- Master AI core system instructions (global)
- Tenant configuration snapshot (pinned version)
- Session state (caller metadata, turn history, prior actions)

Context assembly rules:
- Include only required data fields (privacy minimization).
- Enforce tenant-scoped retrieval for every field.
- Reject request if configuration snapshot is invalid or missing.

## 3) Conversation Loop
For each turn:
1. Caller utterance is transcribed.
2. Intent and confidence are computed.
3. Workflow planner selects one action path:
   - FAQ response
   - Booking workflow
   - Cancellation/reschedule workflow
   - Escalation workflow
4. Policy engine validates planned action.
5. Tool orchestrator executes needed external calls.
6. Response generator returns constrained output for TTS delivery.
7. Session state and event logs are updated.

## 4) Booking Logic Application

### Booking Decision Inputs
- Tenant booking rules
- Service constraints
- Location hours and timezone
- Real-time provider availability
- Caller eligibility (new/returning if known)

### Booking Execution Steps
1. Validate service eligibility and policy constraints.
2. Query available slots through integration service.
3. Offer ranked options to caller.
4. Confirm caller choice and required patient details.
5. Write booking via idempotent integration call.
6. Confirm appointment details and optional notification channel.

### Booking Guardrails
- Never confirm appointment before external write success.
- Detect conflicting slot updates and re-offer alternatives.
- If integration latency exceeds threshold, inform caller and trigger fallback.

## 5) Escalation Rules

### Escalation Triggers
- Low confidence on critical intent
- Explicit human request by caller
- Emergency or sensitive topic detection
- Booking action blocked by policy or integration failure
- Repeated clarification loops beyond threshold

### Escalation Paths
- Warm transfer to live front desk
- Callback queue creation with priority
- Emergency guidance script + immediate human routing

### Escalation Payload
- Caller context summary
- Intent and confidence trail
- Actions attempted and failures
- Recommended next step for staff

## 6) Session Completion
At call end:
- Persist final disposition (`resolved`, `booked`, `escalated`, `callback_required`, `failed`).
- Store structured summary and key entities extracted.
- Emit analytics events for downstream dashboards.
- Close session and release ephemeral runtime memory.

## AI Request Contract

| Field | Source | Required |
| --- | --- | --- |
| tenant_id | Telephony mapping | Yes |
| config_version | tenant_active_config lookup | Yes |
| clinic_profile | configuration store | Yes |
| booking_rules | configuration store | Yes |
| policies | configuration store | Yes |
| tone_profile | configuration store | Yes |
| runtime_turn_state | session service | Yes |
| integration_capabilities | integration service | Yes |

## Logging and Analytics

### Required Event Types
- `call.started`
- `call.intent_detected`
- `faq.resolved`
- `booking.requested`
- `booking.confirmed`
- `booking.failed`
- `call.escalated`
- `call.completed`

### Observability Requirements
- Correlation ID on every log and event.
- Structured logs with tenant, session, action, and outcome.
- Metrics:
  - Response latency
  - Tool call success rate
  - Booking conversion
  - Escalation rate
  - Drop-off/abandonment rate

## Error Handling and Fallbacks

| Failure Scenario | Detection | Fallback |
| --- | --- | --- |
| STT/TTS degradation | Timeout/error threshold | Repeat prompt, then escalate |
| PMS unavailability | Integration health check failure | Offer callback queue, notify staff |
| Configuration missing critical field | Validation failure at context assembly | Escalate and open config incident |
| Policy conflict | Guardrail engine rejection | Human handoff with explanation |

## Security and Compliance in Runtime
- Tenant-scoped authorization on every data read and write.
- Minimize PHI in model context and logs.
- Encrypt call metadata at rest and in transit.
- Maintain immutable decision traces for audit.

## Performance Targets
- Median turn latency: <= 1.5 seconds
- Booking confirmation round-trip: <= 3 seconds (excluding human delay)
- Call session service availability: >= 99.9%
- Event pipeline completeness: >= 99.9%

## Operational Control Points
- Kill switch for tenant runtime if misconfiguration detected.
- Config version rollback without redeploying core AI.
- Real-time alerting on booking failure spikes and escalation anomalies.
