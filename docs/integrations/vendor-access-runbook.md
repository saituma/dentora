# PMS Vendor Access Runbook

Status: required before SOE/EXACT or CS R4+ production integration work.

Dentora currently treats SOE/EXACT and CS R4+ as fail-closed vendor shells. Do not select either provider as live scheduling until the items below are confirmed and implemented.

## Required Evidence

- Official API documentation for appointment, availability, patient, and webhook or polling workflows.
- Sandbox or demo tenant with permission to create, reschedule, and cancel test appointments.
- Auth model and credential rotation process.
- Rate limits, retry guidance, idempotency rules, and audit-header requirements.
- Data-processing agreement, subprocessor terms, security review path, and support escalation process.
- Confirmation whether an on-prem connector, VPN, client certificate, or regional base URL is required.

## SOE/EXACT Request

Subject: SOE/EXACT scheduling API and sandbox access request

Hello,

We are integrating Dentora, an AI receptionist and scheduling workflow, with SOE/EXACT for a dental practice. Please provide the official integration path for appointment scheduling.

We need:

- API documentation for appointment read, availability, create, cancel, and reschedule.
- Patient lookup rules and supported identifiers.
- Sandbox or demo tenant access for automated verification.
- Auth requirements, scopes, credential rotation, and rate limits.
- Webhook support for appointment and patient changes, or the supported polling model.
- Confirmation whether an on-prem connector, VPN, client certificate, or regional deployment is required.
- Data-processing/legal/security review requirements before production use.
- Production certification and incident escalation process.

We will not use simulator behavior as production evidence. Please confirm the supported path and any partner program requirements.

## CS R4+ Request

Subject: CS R4+ scheduling API, connector, and sandbox access request

Hello,

We are integrating Dentora, an AI receptionist and scheduling workflow, with CS R4+ for a dental practice. Please provide the official integration path for appointment scheduling.

We need:

- API or connector documentation for appointment read, availability, create, cancel, and reschedule.
- Patient lookup rules and supported identifiers.
- Sandbox or demo tenant access for automated verification.
- Auth requirements, scopes, credential rotation, and rate limits.
- Webhook support for appointment and patient changes, or the supported polling model.
- Confirmation whether CS R4+ requires an on-prem connector, VPN, client certificate, or regional base URL.
- Data-processing/legal/security review requirements before production use.
- Production certification and incident escalation process.

We will not use simulator behavior as production evidence. Please confirm the supported path and any partner program requirements.

## Acceptance Gate

Move a vendor from shell-only to implementation only after all of these are true:

- Vendor docs are stored in the project knowledge base or linked from a tracked internal ticket.
- Sandbox credentials are available in the secret manager, not source control.
- Legal/DPA/security approval is recorded.
- A provider-specific implementation plan lists real endpoints, auth, idempotency, error mapping, and PHI constraints.
- Focused tests prove fail-closed behavior, credential validation, sandbox read/write verification, and tenant isolation.
