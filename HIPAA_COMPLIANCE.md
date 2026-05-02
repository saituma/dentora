# HIPAA Compliance Posture — DentalFlow

## Overview

DentalFlow handles Protected Health Information (PHI) including patient profiles,
medical history, appointment records, and voice call recordings for dental practices.
Any production deployment **must** comply with HIPAA requirements.

## Current Status

### Implemented Safeguards

#### Technical

| Safeguard | Status | Details |
|-----------|--------|---------|
| Encryption at rest | Partial | API keys and sensitive credentials encrypted with AES-256-GCM. Database-level encryption depends on provider (Render/AWS/Neon). |
| Encryption in transit | Yes | HTTPS enforced via Nginx TLS config and Fly.io auto-TLS. |
| Access controls | Yes | JWT authentication, role-based access (owner, admin, manager, viewer), per-tenant Row-Level Security (RLS). |
| Audit logging | Yes | `auditLog` table tracks actor, action, resource, before/after state. Middleware logs all tenant operations. |
| PII redaction in logs | Yes | Pino logger redacts `password`, `callerPhone`, `ssn`, `creditCard`, `apiKey`, `authorization` headers. |
| Session management | Yes | Refresh tokens with configurable expiry, session table, logout invalidation. |
| Input validation | Yes | Zod schema validation on all API routes. |
| Rate limiting | Yes | Redis-backed sliding window rate limits on auth (5/15min), API (1000/min). |
| Error handling | Yes | Internal errors masked from client responses (generic "An unexpected error occurred"). |

#### Administrative

| Safeguard | Status | Details |
|-----------|--------|---------|
| BAA with cloud providers | **Not done** | Required before storing PHI on any cloud service (database host, Redis, S3, Twilio, etc.). |
| Data retention policy | **Not done** | No automated deletion schedule for call recordings, transcripts, or patient data. |
| Incident response plan | **Not done** | No documented breach notification process. |
| Risk assessment | **Not done** | No formal HIPAA risk assessment documented. |
| Employee training | **Not done** | No documented HIPAA training for team members with PHI access. |
| Privacy policy | **Not done** | No patient-facing privacy notice. |

## Required Before Production

### Priority 1 — Blockers

1. **Business Associate Agreements (BAAs)**
   - Database provider (Render PostgreSQL / Neon / AWS RDS)
   - Redis provider (Render Redis / AWS ElastiCache)
   - Twilio (for voice calls and SMS — [Twilio offers BAAs](https://www.twilio.com/legal/hipaa-eligible-products-and-services))
   - S3 / object storage for file uploads
   - Sentry (error tracking — ensure no PHI in error payloads, or use a HIPAA-compliant plan)
   - ElevenLabs / Deepgram / OpenAI (if PHI passes through AI providers)
   - Email provider (SMTP service)

2. **Data retention and deletion**
   - Define retention periods for: call recordings, transcripts, patient profiles, audit logs
   - Implement automated purge jobs (BullMQ `DAILY_AGGREGATION` queue is a natural place)
   - Provide patient data export and deletion endpoints (right to access / right to delete)

3. **Sentry PHI audit**
   - `sendDefaultPii` is `false` — good
   - Verify that error context objects never include patient names, phone numbers, or health data
   - Consider self-hosted Sentry or a HIPAA-eligible plan

### Priority 2 — Should Have

4. **Database encryption at rest**
   - Enable transparent data encryption (TDE) on PostgreSQL
   - Use encrypted Redis (TLS + at-rest encryption)

5. **Call recording storage**
   - Recordings must be stored in an encrypted, access-controlled bucket
   - S3 server-side encryption (SSE-S3 or SSE-KMS)
   - Bucket policy restricting access to the application service account only

6. **Access logging**
   - Log all PHI access events (patient profile views, transcript reads) to audit table
   - Implement periodic audit log review process

7. **Backup and disaster recovery**
   - Automated daily database backups with encryption
   - Tested restore procedure
   - Document RPO (Recovery Point Objective) and RTO (Recovery Time Objective)

### Priority 3 — Documentation

8. **Risk assessment document** — formal HIPAA risk analysis
9. **Incident response plan** — breach detection, notification (72-hour rule), remediation
10. **Privacy notice** — patient-facing document explaining data collection and use
11. **Minimum necessary standard** — review API responses to ensure only required PHI fields are returned

## Architecture Notes for HIPAA

```
Patient browser ──HTTPS──▶ Nginx (TLS termination)
                               │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                Next.js     Express API   Twilio webhooks
                (no PHI     (JWT + RLS)   (signature verified)
                 at rest)       │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                PostgreSQL    Redis       S3 / Object Store
                (RLS,         (ephemeral  (recordings,
                 audit log)    cache)      documents)
```

- **Row-Level Security** ensures tenants cannot access each other's data at the database level
- **Correlation IDs** in all requests enable audit trail reconstruction
- **PII redaction** prevents PHI from appearing in application logs
- **Webhook signature verification** (Twilio, Stripe) prevents spoofed requests

## Contacts

- **HIPAA Security Officer**: _[Assign before production]_
- **Technical Lead**: _[Assign]_
- **Legal / Compliance**: _[Assign]_
