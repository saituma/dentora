# Data Schema - Production Multi-Tenant AI Receptionist Platform

## Purpose
Define production-grade data structures for tenant isolation, dedicated telephony routing, centralized AI provider usage, and per-call cost attribution.

## Schema Principles
- Every tenant-owned table includes `tenant_id`.
- Dedicated Twilio number is mapped to exactly one tenant.
- Voice profile is configurable per tenant and versioned with configuration.
- TTS/STT/LLM provider accounts are platform-level resources and not stored in tenant tables.
- Runtime, analytics, and cost records remain tenant-attributed.

## Scope Separation

### Tenant-Owned Data (In This Schema)
All tables below are tenant-partitioned and include `tenant_id`.

### Platform-Owned Provider Accounts (Out of Tenant Schema)
Provider credentials for TTS/STT/LLM are centrally managed by platform operations and secret management systems. They are **not** persisted as per-tenant records.

## Core Tenant Tables

## 1) `tenant_registry`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK (canonical tenant_id) |
| tenant_id | UUID | Yes | Duplicate canonical key for uniform query contracts |
| clinic_slug | text | Yes | Unique tenant slug |
| status | enum | Yes | active, suspended, archived |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id)` unique
- `(clinic_slug)` unique

## 2) `twilio_numbers`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Tenant owner |
| twilio_account_label | text | Yes | Internal account reference label |
| phone_number_e164 | text | Yes | Dedicated Twilio number |
| capability_voice | boolean | Yes | Voice enabled |
| capability_sms | boolean | Yes | SMS enabled (optional workflows) |
| is_primary | boolean | Yes | Primary inbound number |
| status | enum | Yes | active, pending, released |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(phone_number_e164)` unique
- `(tenant_id, is_primary)`
- `(tenant_id, status)`

## 3) `clinic_profile`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version snapshot key |
| clinic_name | text | Yes | Display name |
| legal_entity_name | text | Yes | Contract identity |
| timezone | text | Yes | IANA zone |
| primary_phone | text | Yes | Public clinic number |
| support_email | text | Yes | Contact email |
| locations | JSONB | Yes | Location list and hours |
| status | enum | Yes | draft, validated, published, archived |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version)` unique
- `(tenant_id, status)`

## 4) `services`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version key |
| service_code | text | Yes | Unique per tenant+version |
| service_name | text | Yes | Caller-facing |
| service_category | enum | Yes | Controlled set |
| duration_minutes | integer | Yes | 5-240 |
| new_patient_allowed | boolean | Yes | Eligibility |
| requires_staff_approval | boolean | Yes | Escalation hint |
| booking_constraints | JSONB | Yes | Rule fragments |
| active | boolean | Yes | Runtime eligibility |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version, service_code)` unique
- `(tenant_id, active)`

## 5) `booking_rules`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version key |
| min_notice_hours | integer | Yes | Rule |
| max_future_days | integer | Yes | Rule |
| cancellation_cutoff_hours | integer | Yes | Rule |
| double_booking_policy | enum | Yes | forbid, conditional, manual_review |
| emergency_slot_policy | JSONB | Yes | Escalation-aware policy |
| reschedule_limits | JSONB | No | Optional |
| after_hours_policy | JSONB | Yes | Routing rules |
| validation_state | enum | Yes | valid, warning, blocked |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version)` unique

## 6) `policies`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version key |
| escalation_conditions | JSONB | Yes | Trigger definitions |
| emergency_disclaimer | text | Yes | Required safety text |
| sensitive_topics | JSONB | Yes | Controlled topic list |
| human_callback_sla_minutes | integer | Yes | SLA commitment |
| compliance_flags | JSONB | Yes | HIPAA and local policy toggles |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version)` unique

## 7) `voice_profile`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version key |
| voice_id | text | Yes | Tenant-selected voice |
| speaking_speed | numeric | Yes | Runtime multiplier (e.g., 0.8-1.2) |
| tone | enum | Yes | calm, friendly, professional, urgent |
| pronunciation_hints | JSONB | No | Clinic-specific vocabulary hints |
| fallback_voice_id | text | No | Secondary choice |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version)` unique

## 8) `faq_library`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version key |
| faq_key | text | Yes | Stable identifier |
| question_variants | JSONB | Yes | Caller phrasing variants |
| canonical_answer | text | Yes | Approved response |
| category | enum | Yes | insurance, hours, procedures, billing, preparation, other |
| escalation_if_uncertain | boolean | Yes | Safety fallback |
| confidence_threshold | numeric | Yes | 0.0-1.0 |
| active | boolean | Yes | Runtime eligibility |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version, faq_key)` unique
- `(tenant_id, category)`

## 9) `integrations`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version key |
| integration_type | enum | Yes | pms, calendar, crm, messaging |
| provider | text | Yes | Vendor name |
| status | enum | Yes | disconnected, pending, active, error |
| credential_ref | text | Yes | Secret reference only |
| capabilities | JSONB | Yes | Supported operations |
| health_last_checked_at | timestamptz | No | Health metadata |
| health_status | enum | Yes | healthy, degraded, failing |
| created_at | timestamptz | Yes | Audit |
| updated_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, config_version, integration_type, provider)` unique
- `(tenant_id, health_status)`

## Configuration and Runtime Tables

## 10) `tenant_config_versions`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| version_number | integer | Yes | Monotonic per tenant |
| status | enum | Yes | draft, validated, published, rolled_back |
| source | enum | Yes | onboarding, ai_chat, admin_edit |
| completeness_score | numeric | Yes | 0-100 |
| validation_report | JSONB | Yes | Blocking/warning details |
| published_at | timestamptz | No | Set when published |
| created_by | UUID | Yes | Actor ID |
| created_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, version_number)` unique
- `(tenant_id, status)`

## 11) `tenant_active_config`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| tenant_id | UUID | Yes | PK |
| active_version_number | integer | Yes | Runtime pointer |
| activated_at | timestamptz | Yes | Audit |
| activated_by | UUID | Yes | Actor |

## 12) `call_sessions`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| config_version | integer | Yes | Version pinned at call start |
| twilio_number_id | UUID | Yes | FK to twilio_numbers |
| telephony_call_id | text | Yes | Twilio call SID |
| caller_phone | text | No | Optional redacted/encrypted |
| status | enum | Yes | started, in_progress, completed, escalated, failed |
| intent_summary | text | No | Latest intent |
| started_at | timestamptz | Yes | Lifecycle |
| ended_at | timestamptz | No | Lifecycle |

Indexes:
- `(tenant_id, started_at desc)`
- `(tenant_id, status)`

## 13) `call_events`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| call_session_id | UUID | Yes | FK to call_sessions |
| event_type | text | Yes | e.g., booking.confirmed |
| event_payload | JSONB | Yes | Structured details |
| created_at | timestamptz | Yes | Event time |

Indexes:
- `(tenant_id, call_session_id, created_at)`
- `(tenant_id, event_type, created_at desc)`

## 14) `call_costs`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | UUID | Yes | PK |
| tenant_id | UUID | Yes | Partition key |
| call_session_id | UUID | Yes | FK to call_sessions |
| stt_provider | text | Yes | Selected global provider name |
| tts_provider | text | Yes | Selected global provider name |
| llm_provider | text | Yes | Selected global provider name |
| stt_cost_usd | numeric | Yes | Usage-attributed cost |
| tts_cost_usd | numeric | Yes | Usage-attributed cost |
| llm_cost_usd | numeric | Yes | Usage-attributed cost |
| telephony_cost_usd | numeric | Yes | Twilio usage cost |
| total_cost_usd | numeric | Yes | Sum of all cost components |
| created_at | timestamptz | Yes | Audit |

Indexes:
- `(tenant_id, created_at desc)`
- `(tenant_id, call_session_id)` unique

## Canonical Tenant Config Snapshot (Published Version)

```json
{
  "tenant_id": "uuid",
  "config_version": 12,
  "clinic_profile": {},
  "services": [],
  "booking_rules": {},
  "policies": {},
  "voice_profile": {},
  "faq_library": [],
  "integrations": []
}
```

## Data Integrity and Isolation Constraints
- `tenant_id` + `config_version` must match across all versioned tenant configuration tables.
- `twilio_numbers.phone_number_e164` is globally unique and maps to exactly one `tenant_id`.
- Publish activation is transactional across `tenant_config_versions` and `tenant_active_config`.
- Runtime sessions pin active config at call start and cannot switch mid-call.
- Cost records are mandatory for completed or failed calls and remain tenant-attributed.

## Explicit Non-Goals (By Design)
- No per-tenant TTS provider account table.
- No per-tenant STT provider account table.
- No per-tenant LLM provider account table.

Provider accounts are centralized platform infrastructure, not tenant-owned schema entities.
