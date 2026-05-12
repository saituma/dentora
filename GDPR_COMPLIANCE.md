# UK GDPR + Data Protection Act 2018 — Dentora Compliance Posture

## Overview

Dentora is a UK-market SaaS handling personal data of dental patients (names, phone numbers,
appointment records, voice call recordings, AI-generated summaries). UK GDPR and the Data
Protection Act 2018 apply. **Dentora is not HIPAA-regulated** — dental practices in the UK
are not covered entities under US law.

Deployment target: **DigitalOcean LON1** (London region, data stays in UK).

## Lawful Basis for Processing

| Data type | Lawful basis (UK GDPR Art. 6) |
|-----------|-------------------------------|
| Appointment records | Legitimate interests (clinic operations) / contract performance |
| Patient name + phone | Contract performance (booking confirmation calls) |
| Voice call recordings | Legitimate interests — inform patients via privacy notice |
| AI summaries / transcripts | Legitimate interests |
| Audit logs | Legal obligation (ICO accountability principle) |

## Current Compliance Status

### Technical Safeguards

| Safeguard | Status | Details |
|-----------|--------|---------|
| Encryption in transit | Yes | HTTPS via nginx TLS (TLSv1.2/1.3) + HSTS. |
| Encryption at rest — PHI | **Not yet** | Patient names, phone numbers, transcripts stored plaintext. Phase 3.2 will add AES-256-GCM column encryption. |
| Encryption at rest — credentials | Yes | API keys encrypted AES-256-GCM via `src/lib/encryption.ts`. |
| Access controls | Yes | JWT + RBAC (owner/admin/manager/viewer) + per-tenant Row-Level Security. |
| Audit logging | Partial | Config changes logged; PHI access (patient reads, transcript views) not yet logged. Phase 3.3 will add PHI audit. |
| PII redaction in logs | Yes | Pino redacts `password`, `callerPhone`, `ssn`, `creditCard`, `apiKey`, `authorization`. |
| Session management | Yes | Refresh token rotation, session table, logout invalidation. |
| Input validation | Yes | Zod schemas on all routes. |
| Rate limiting | Yes | Redis-backed limits: auth 5 req/15min, API 30 req/s. |
| MFA | **Not yet** | Phase 3.4 adds TOTP with recovery codes. |

### Administrative Safeguards

| Requirement | Status | Action |
|-------------|--------|--------|
| ICO registration | **Not done** | Register at ico.org.uk (~£40–60/yr). Required for any UK data controller. |
| Data Processing Agreements | **Not done** | Sign DPAs with: DigitalOcean, Twilio, ElevenLabs, OpenAI, Vercel, Resend. All offer standard DPAs. |
| Data retention policy | **Not done** | Stub exists in `src/lib/data-retention.ts`. Phase 3.10 will implement 2yr recordings / 7yr audit logs. |
| Backup strategy | **Not done** | Phase 3.6: daily pg_dump → encrypted DigitalOcean Spaces, 30-day retention. |
| Breach notification (72h) | **Not done** | Phase 3.12: runbook for ICO notification within 72h of discovery. |
| Privacy policy | Partial | Page exists at `/privacy`. Content needs UK GDPR language. Phase 3.11. |
| Right to erasure (Art. 17) | **Not done** | Phase 3.8: admin endpoint deletes patient + all linked data. |
| Data Subject Access Request | **Not done** | Phase 3.9: export endpoint returns all data for a patient as JSON. |

## Required Before Accepting Live Patient Data

### Priority 1 — Blockers

1. **ICO registration** — register at ico.org.uk as a data controller
2. **DPAs signed** — DigitalOcean, Twilio, ElevenLabs, OpenAI, Vercel, Resend
3. **HTTPS enforced** — nginx HTTPS block enabled (Phase 0.3)
4. **Proper ENCRYPTION_KEY** — 64-hex chars via `openssl rand -hex 32`, not auto-generated base64
5. **Redis enabled** — REDIS_DISABLED must be false in production

### Priority 2 — Should Have Before Launch

6. **PHI column encryption** — patient names, phone numbers, transcripts encrypted at rest (Phase 3.2)
7. **PHI audit logging** — log every read/write of patient data (Phase 3.3)
8. **MFA** — for admin and owner roles at minimum (Phase 3.4)
9. **Database backups** — automated daily pg_dump to encrypted storage (Phase 3.6)
10. **Right to erasure endpoint** (Phase 3.8)
11. **DSAR export endpoint** (Phase 3.9)

### Priority 3 — Ongoing Compliance

12. **Data retention automation** — implement the `data-retention.ts` stub (Phase 3.10)
13. **Breach notification runbook** — documented 72h ICO process (Phase 3.12)
14. **Quarterly restore drill** — verify backups actually work (Phase 3.7)

## Architecture Notes

```
Patient browser ──HTTPS──▶ Nginx (TLS 1.2/1.3, HSTS)
                               │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                Next.js     Express API   Twilio webhooks
                (no PHI     (JWT + RLS)   (signature verified)
                 at rest)       │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                PostgreSQL    Redis       DO Spaces
                (RLS,         (ephemeral  (call recordings
                 audit log)    cache)      encrypted)
```

- **DigitalOcean LON1** — UK data residency satisfied for ICO
- **Row-Level Security** — tenants cannot access each other's data
- **Correlation IDs** — full audit trail reconstruction
- **PII redaction in logs** — no patient data in Pino/Sentry

## Key Differences from HIPAA

UK GDPR is lighter: no mandatory BAAs (replaced by DPAs, which are simpler), no
annual risk assessment requirement, no mandatory training programme. The main
obligations are: lawful basis, transparency (privacy notice), data minimisation,
security appropriate to the risk, and responding to data subject rights within 30 days.

Dental practices are **not** special category data controllers unless they process
health records beyond appointment booking. If health/clinical records are stored,
consent or substantial public interest becomes the lawful basis.

## Contacts

- **Data Protection Officer (UK GDPR Article 37)**: _Assign if processing at large scale_
- **ICO Registration Number**: _Fill in after registration_
- **Technical Lead**: _Assign_
