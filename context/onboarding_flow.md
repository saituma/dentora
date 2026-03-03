# Onboarding Flow - Structured Tenant Configuration

## Purpose
Define the structured onboarding process that creates the initial tenant configuration artifact for each clinic.

## Design Principles
- Schema-first data collection only.
- Every onboarding step writes to explicit schema fields.
- Validation gates ensure deployment-ready data quality.
- Partial completion is allowed, but publish requires completeness thresholds.

## Onboarding Stages
1. Tenant Creation and Identity Setup
2. Clinic Profile and Operating Model
3. Service and Booking Configuration
4. Policy and Escalation Configuration
5. Tone and Communication Profile
6. Integration Setup
7. Configuration Readiness Review
8. Handoff to Guided AI Configuration Chat

## Structured Onboarding Inputs

### 1) Clinic Identity and Contact

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| clinic_name | string | Yes | 2-120 chars |
| legal_entity_name | string | Yes | Non-empty |
| tenant_slug | string | Yes | Unique, lowercase, URL-safe |
| primary_phone | E.164 string | Yes | Valid phone format |
| support_email | email | Yes | RFC-compliant |
| timezone | enum | Yes | IANA timezone |
| locations_count | integer | Yes | >= 1 |

### 2) Location and Hours

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| location_name | string | Yes | Per location |
| address | object | Yes | Street, city, state, zip |
| operating_hours | weekly schedule | Yes | Start < end |
| holiday_overrides | list | No | Date ranges, reason |
| after_hours_behavior | enum | Yes | voicemail, callback, emergency routing |

### 3) Core Service Configuration

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| service_name | string | Yes | Unique within tenant |
| service_category | enum | Yes | preventive, restorative, cosmetic, emergency, orthodontic, other |
| duration_minutes | integer | Yes | 5-240 |
| new_patient_allowed | boolean | Yes | N/A |
| booking_lead_time_hours | integer | Yes | 0-720 |
| requires_staff_approval | boolean | Yes | N/A |
| preparation_notes | string | No | Max length enforced |

### 4) Booking Rules Configuration

| Rule | Type | Required | Description |
| --- | --- | --- | --- |
| min_notice_hours | integer | Yes | Minimum time before appointment slot |
| max_future_days | integer | Yes | Furthest date AI can book |
| allowed_booking_channels | set | Yes | phone, sms-followup, human-only |
| cancellation_cutoff_hours | integer | Yes | Policy cutoff before appointment |
| reschedule_limit_per_patient | integer | No | Optional abuse control |
| double_booking_policy | enum | Yes | forbid, conditional, manual-review |
| emergency_slot_policy | enum | Yes | reserved slots and routing behavior |

### 5) Policy and Escalation Inputs

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| escalation_phone | E.164 string | Yes | Reachable number |
| escalation_conditions | set | Yes | emergency, low-confidence, billing-dispute, patient-request |
| emergency_disclaimer_script | string | Yes | Required safety language |
| sensitive_topics | set | Yes | Controlled vocabulary |
| human_callback_sla_minutes | integer | Yes | 5-240 |

### 6) Tone Configuration

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| brand_voice | enum | Yes | professional, warm, premium, concise |
| verbosity_level | enum | Yes | short, balanced, detailed |
| empathy_level | enum | Yes | low, medium, high |
| greeting_style | enum | Yes | formal, friendly |
| prohibited_phrases | list[string] | No | Brand/legal constraints |
| required_phrases | list[string] | No | Compliance/brand standards |

### 7) Integration Readiness Inputs

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| pms_provider | enum | Yes | Dentrix, OpenDental, other |
| scheduling_source_of_truth | enum | Yes | PMS-first or Calendar-first |
| telephony_provider | enum | Yes | Twilio, etc. |
| notification_channel | set | Yes | sms, email |
| integration_owner | string | Yes | Responsible clinic contact |

## Booking Rules Configuration Logic

### Mandatory Rule Checks
- Slot must respect operating hours and location timezone.
- Slot must satisfy `min_notice_hours`.
- Booking date must be <= `max_future_days`.
- Service duration must fit contiguous availability window.
- Existing overlapping appointments must follow `double_booking_policy`.

### Override Model
- Tenant-level default rules
- Location-level overrides
- Service-level constraints
- Runtime escalation if rule conflicts cannot be resolved automatically

## Service Configuration Model

### Service Definition Requirements
- Every bookable service must have:
  - Unique service code
  - Duration
  - Eligible patient type (new, returning, both)
  - Booking constraints
  - Escalation requirement flag (if complex)

### Service Eligibility Decision Inputs
- Caller intent
- Patient status (new/returning if known)
- Insurance constraints (if configured)
- Provider availability and location compatibility

## Tone Configuration Model

### Tone Controls Applied at Runtime
- Greeting and opening script style
- Clarifying question style
- Confirmation phrasing style
- Escalation explanation style

### Guardrails
- Tone cannot override safety policies.
- Prohibited phrases are filtered pre-delivery.
- Required phrases enforced for emergency or sensitive flows.

## Onboarding Validation Framework

### Validation Types
- Syntactic: field format, ranges, enums
- Semantic: policy consistency, schedule logic, escalation completeness
- Operational: integration credentials and endpoint health checks
- Readiness: required coverage score for deployment

### Readiness Scorecard

| Domain | Weight | Minimum Pass |
| --- | --- | --- |
| Clinic profile completeness | 15% | 100% required fields |
| Service catalog quality | 20% | >= 90% complete |
| Booking rules consistency | 25% | 0 blocking conflicts |
| Policy and escalation safety | 25% | 100% mandatory rules |
| Tone profile completeness | 5% | 100% required fields |
| Integration readiness | 10% | All mandatory connectors healthy |

## Outputs of Structured Onboarding
- Draft tenant configuration version (`v0-draft`)
- Validation report with errors/warnings
- Gaps list for guided AI configuration chat
- Deployability status (`not_ready`, `needs_review`, `ready_for_chat`)

## Exit Criteria to Move into AI Configuration Chat
- All mandatory identity, hours, services, booking, and escalation fields are present.
- No blocking validation errors.
- At least one booking-capable integration path is configured or marked fallback-only.
- System can generate targeted chat questions from remaining optional and ambiguous fields.
