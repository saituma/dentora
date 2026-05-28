# SOE/EXACT Integration Foundation

Status: foundation only. Dentora does not currently make production SOE/EXACT API calls.

The server contains a fail-closed `SchedulingProviderPort` shell and a local simulator for tests. Do not enable live clinic use until the vendor confirms access, docs, auth, legal terms, and supported scheduling operations.

## Current Controls

- Feature flag: `ENABLE_SOE_EXACT=false` by default.
- Adapter path: `apps/server/src/modules/pms/adapters/soe-exact/`.
- Production shell throws typed errors instead of calling vendor systems.
- Local simulator is test-only and must not be treated as vendor compatibility proof.
- Dashboard configuration stores vendor-readiness evidence, but scheduling selection stays blocked until a live adapter is implemented and sandbox contract tests pass.

## Readiness Checklist

- API docs available?
- Sandbox/demo environment available?
- Appointment read supported?
- Availability supported?
- Appointment create supported?
- Cancel/reschedule supported?
- Patient lookup supported?
- Webhooks or polling supported?
- On-prem connector required?
- Auth model confirmed?
- Data-processing/legal approved?
- Live adapter implemented?
- Sandbox contract tests passed?
- Controlled pilot runbook approved?

## Production Enablement Gate

SOE/EXACT can move from foundation-only to implementation only after official docs, sandbox/demo access, scheduling operations, auth, and legal/data-processing checks are approved in the PMS readiness checklist.

It can move from implementation to live scheduling only after the production adapter exists, sandbox contract tests pass against SOE/EXACT, and a controlled pilot runbook is approved. Until then, the server must continue throwing typed vendor-access errors instead of attempting guessed calls.

## Vendor Questions

1. Can you provide official SOE/EXACT API documentation for appointment scheduling?
2. Is there a sandbox or demo tenant we can use for automated verification?
3. Which appointment read endpoints are available, and what filters are supported?
4. Is availability exposed as a first-class API, or must it be derived from books/diaries?
5. Can appointments be created through the API? If yes, what payload wrapper and required fields are used?
6. Can appointments be cancelled and rescheduled through the API? If yes, are these state updates or separate operations?
7. How should patient lookup be performed, and which identifiers are safe and supported?
8. Are webhooks available for appointment and patient changes? If not, what polling model is supported?
9. Is an on-prem connector required for UK dental practices using SOE/EXACT?
10. What auth model is required: OAuth, API key, client certificate, VPN, or connector token?
11. What rate limits, retries, idempotency keys, and audit headers are required?
12. What data-processing agreement, subprocessor terms, and security review are required before production use?
13. Are there separate environments or base URLs for production, sandbox, and regional deployments?
14. What support process should we use for vendor certification and production incident escalation?
