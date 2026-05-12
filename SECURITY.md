# Security Policy

## Supported versions

| Version           | Supported |
| ----------------- | --------- |
| `master` (latest) | Yes       |
| Older branches    | No        |

## Reporting a vulnerability

**Please do not report security vulnerabilities via GitHub issues.**

Email: **security@dentora.co.uk** (or the email on file for this repo)

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact (data exposed, tenants affected, etc.)
- Your suggested fix (optional)

**Response times:**

- Acknowledgement: within 48 hours
- Initial assessment: within 5 business days
- Fix timeline: critical within 7 days, high within 30 days

We follow responsible disclosure — please give us reasonable time to fix before public disclosure. We will credit you in the fix commit unless you prefer anonymity.

## Security measures in place

- **PHI encryption at rest**: AES-256-GCM on all patient name, phone, notes, transcripts
- **TLS in transit**: HTTPS enforced everywhere via Let's Encrypt + Nginx; Postgres `sslmode=require`
- **Authentication**: JWT (15min access token) + rotating refresh tokens (httpOnly cookie)
- **MFA**: TOTP (RFC 6238) available for all users; enforced for admin role
- **Rate limiting**: per-IP on all auth and webhook endpoints
- **CSRF protection**: on all state-changing endpoints
- **Audit logging**: every patient and call data access logged with actor, timestamp, action
- **Dependency scanning**: GitHub Dependabot + `npm audit` in CI
- **Secret rotation**: documented runbook in `apps/server/scripts/rotate-secrets.ts`
- **Data isolation**: every DB query and cache key scoped to `tenantId`
- **Webhook idempotency**: Redis-backed deduplication prevents replay attacks on Twilio webhooks
- **Circuit breakers**: all external AI/telephony calls protected from cascading failures

## UK GDPR

Dentora processes UK patient data under UK GDPR / DPA 2018. For data subject requests (access, erasure, portability) contact the data controller at the clinic you're registered with.

Breach notification: ICO within 72 hours per Article 33. Runbook: `docs/runbooks/data-breach.md`.
