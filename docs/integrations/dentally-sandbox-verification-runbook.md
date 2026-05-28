# Dentally Sandbox Verification Runbook

Status: required before Dentally can be selected as a live scheduling provider.

This runbook is for a real Dentally sandbox or approved controlled pilot. The local simulator is useful for regression tests, but it is not production evidence.

## Prerequisites

- `ENABLE_DENTALLY=true`
- `DENTALLY_VERIFICATION_ENABLED=true`
- `DENTALLY_API_BASE_URL` or `DENTALLY_BASE_URL` points at the approved Dentally sandbox host.
- Dentally integration row exists for the tenant with encrypted OAuth tokens, refresh token, token expiry, scopes, practice metadata, and webhook secret.
- Required scopes are available: appointment read/create/update, patient read/create/update, practice read, and user read.
- Webhook endpoint is reachable from the Dentally sandbox:
  `/api/pms/webhooks/dentally/:tenantId/:integrationId`
- For real sandbox write verification only:
  - `DENTALLY_ALLOW_SANDBOX_WRITES=true`
  - The base URL must be the Dentally sandbox host.
  - Test patient and appointment IDs must be explicitly sandbox/test records.

## Verification Order

Run these from the dashboard or the authenticated PMS verification API:

1. Connectivity
2. Credentials
3. Scopes
4. Patient lookup
5. Appointment read
6. Appointment create dry run
7. Appointment cancel dry run
8. Webhook verification with a captured raw Dentally sandbox payload
9. Appointment create with `executeVendorWrite=true`
10. Appointment cancel with `executeVendorWrite=true`
11. Full verification report

## Pass Criteria

Dentally may be selected as a live scheduling provider only when the backend report returns:

- `productionRecommendation` is `SANDBOX VERIFIED` or `CONTROLLED PILOT READY`.
- `productionBlockers` is empty.
- Webhook verification used a captured raw sandbox payload.
- Create and cancel verification both executed against the Dentally sandbox.
- Sandbox safety checks pass.

## Current Local Status

No Dentally sandbox environment variables were present in the local `.env` files during this hardening pass. Do not run real verification until sandbox credentials are available in the secret manager or local environment.
