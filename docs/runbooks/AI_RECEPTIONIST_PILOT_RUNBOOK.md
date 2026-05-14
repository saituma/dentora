# AI Receptionist Pilot Runbook

**Scope:** 1–3 clinic staff-supervised pilot.  
**Mode:** All AI appointment changes are held for staff review. No autonomous mutations.

---

## Required Env Flags

Set these in production before go-live. All default to `false` — they must be explicitly enabled.

| Flag                                       | Required value | Purpose                                                                  |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------ |
| `FF_AI_APPOINTMENT_CHANGES_REQUIRE_REVIEW` | `true`         | AI cancel/reschedule creates review item instead of mutating immediately |
| `FF_PILOT_PREFLIGHT_REQUIRED`              | `true`         | Blocks live calls if preflight checks fail                               |
| `FF_APPOINTMENT_RECONCILIATION_PROCESSOR`  | `true`         | Background ledger/calendar drift detection                               |
| `FF_TWILIO_MEDIA_STREAMS`                  | `true`         | Real-time audio WebSocket pipeline                                       |
| `FF_DATABASE_RLS`                          | `true`         | Postgres row-level security on appointments                              |

---

## Required Notification Sender

Staff review alerts and daily digests require at least one of:

| Method             | Env vars                                           |
| ------------------ | -------------------------------------------------- |
| Resend (preferred) | `RESEND_API_KEY`                                   |
| SMTP fallback      | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |

Preflight does not check this — absence is silent until the first send attempt (the mailer throws at send time). Pilot clinics will not receive email notifications until a sender is configured.

---

## Before-Go-Live Checklist

Run this for each clinic before the AI receptionist takes live calls.

0. **Confirm last successful Postgres backup is < 24h old.** Owner: On-call engineer.
1. **Complete onboarding wizard** — clinic profile, services, booking rules, voice, policies, FAQs. Owner: Tenant admin.
2. **Configure notification sender** — set `RESEND_API_KEY` or SMTP vars before running preflight so alert emails work from day one. Owner: On-call engineer.
3. **Connect Google Calendar** — OAuth integration under Settings → Integrations. Owner: Tenant admin.
4. **Run Google Calendar PHI dry-run.** Owner: On-call engineer.
   - `POST /api/integrations/google/calendar/phi-remediation/dry-run`
   - Review the report: `GET /api/integrations/google/calendar/phi-remediation/latest`
   - If risky events found, run scrub (step 5). If zero risky events, proceed to step 6.
5. **Scrub legacy calendar PHI (only if needed).** Owner: On-call engineer.
   - `POST /api/integrations/google/calendar/phi-remediation/scrub` with `{ "confirm": true }`
   - Only after reviewing the dry-run report. Never auto-run.
   - Verify scrub with a fresh dry-run afterwards.
6. **Run pilot preflight** — `GET /api/onboarding/pilot-preflight`. Owner: On-call engineer.
   - All blocking checks must pass. Address any blockers before proceeding.
   - Re-run preflight after resolving each blocker to confirm the check clears.
7. **Review & publish via the onboarding wizard.** Owner: Tenant admin.
   - Open the final onboarding step (Review & Go Live). Confirm the readiness score shows no blocking issues and calendar is connected, then click **Publish**.
   - After publishing, **perform a real inbound test call**: dial the clinic's Twilio number from a staff phone, go through the AI conversation, then verify:
     - A call session and transcript were created (check Dashboard → Calls).
     - No PHI appears in server logs (`docker compose logs server | grep -i "patient\|phone\|name"`).
     - No errors in the browser console or Twilio console.

---

## Daily Staff Checklist

Each working day before calls start:

1. Open **Dashboard → Staff Review** and work through any open items. Owner: Clinic staff.
   - High/critical items block pilot preflight — clear them before the day begins.
   - Check "Cancellation requests" and "Reschedule requests" — call the patient to confirm.
2. Review the **daily digest email** (sent at startup and every 24h). Counts only — click the dashboard link for details. Owner: Clinic staff.
3. Check for **alert emails** — sent every hour for unresolved high/critical or overdue items. Owner: Clinic staff.
4. Spot-check 2–3 AI call summaries per day for quality. Owner: Clinic staff.

---

## Running Pilot Preflight

```bash
GET /api/onboarding/pilot-preflight
Authorization: Bearer <staff-jwt>
```

The response lists `blocking` and `warning` issues. A clinic cannot go live if any blocking issue is present.

Example response shape:

```json
{
  "blocking": [{ "code": "CALENDAR_PHI_SCAN_REQUIRED", "message": "..." }],
  "warning": [{ "code": "WORKER_HEALTH_STALE", "message": "..." }],
  "workerHealth": { "status": "healthy", "lastHeartbeatAt": "2026-05-14T08:00:00Z" },
  "recentMediaStreamFailures": 0
}
```

**Blocking checks:**

- Onboarding readiness has no blocking issues
- Calendar PHI scan completed within the last 7 days
- No risky legacy Google Calendar events
- No open high/critical staff review items
- No failed appointment reconciliation items
- Reconciliation processor feature flag enabled
- Media-stream failures ≥ 25 in the last 24h (`MEDIA_STREAM_FAILURES_HIGH`)
- Worker health not `unhealthy` (when `FF_PILOT_PREFLIGHT_REQUIRED=true`)

**Warning checks (non-blocking):**

- Worker health stale or degraded
- Media-stream failures > 0 and < 25 in the last 24h
- Retrying reconciliation items exist

---

## Google Calendar PHI Remediation

### Dry-run (safe — read-only)

```bash
POST /api/integrations/google/calendar/phi-remediation/dry-run
Authorization: Bearer <staff-jwt>
```

Returns counts: total events scanned, risky events count, risk code summary.  
No event content, summaries, patient names, or PHI in the response.

### Review the result

```bash
GET /api/integrations/google/calendar/phi-remediation/latest
Authorization: Bearer <staff-jwt>
```

### Scrub (destructive — only after staff review of dry-run)

```bash
POST /api/integrations/google/calendar/phi-remediation/scrub
Authorization: Bearer <staff-jwt>
Content-Type: application/json

{ "confirm": true }
```

This removes PHI from legacy Google Calendar event fields (summary, description, extended properties). It is irreversible. Run only after reviewing the dry-run report and confirming with clinic staff.

After scrub, a verification scan runs automatically to update the preflight status.

---

## Handling Cancellation / Reschedule Review Items

When `FF_AI_APPOINTMENT_CHANGES_REQUIRE_REVIEW=true` (required for pilot):

1. The AI tells the patient: "I've sent your request to the clinic team for review — they'll follow up."
2. A staff review item is created with type `cancellation_requested` or `reschedule_requested`.
3. Staff must **call the patient** to confirm, then action the appointment manually in the PMS/calendar.
4. In the staff review dashboard, resolve or ignore the item once actioned.

**Never** approve AI cancel/reschedule requests without confirming with the patient.  
The AI does not have authority to execute these — staff are the final decision-makers during pilot.

---

## What Must Remain Disabled / Not Autonomous

During the pilot, the following must NOT be enabled without additional review:

- **`FF_AI_APPOINTMENT_CHANGES_REQUIRE_REVIEW=false`** — would allow the AI to cancel or reschedule appointments without staff approval. Do not disable during pilot.
- **Autonomous scrub scheduling** — the calendar PHI scrub is never run automatically. It requires explicit staff confirmation via the API.
- **Full provider failover / dynamic model routing** — not tested in pilot configuration.

---

## Emergency Rollback

If the AI receptionist causes patient harm, data issues, or unexpected behavior:

1. **Disable incoming calls** — remove or disable the Twilio phone number in the Twilio console. Owner: On-call engineer.
2. **Stop the server container**: `docker compose -f docker-compose.prod.yaml stop server worker`
3. **Preserve logs**: `docker compose -f docker-compose.prod.yaml logs server > /tmp/server-$(date +%Y%m%d-%H%M).log`
4. **Restore from last good image** (if needed):
   ```bash
   git log --oneline -10   # find last good SHA
   git checkout -b hotfix/rollback-$(date +%Y%m%d) <sha>
   docker compose -f docker-compose.prod.yaml pull
   docker compose -f docker-compose.prod.yaml up -d
   ```
5. **Notify affected patients** — check Staff Review dashboard for any pending cancel/reschedule items that need manual follow-up.
6. **File an incident**: notify `<TODO: ops Slack channel or email>` immediately with:
   ```
   Incident: <one-line summary>
   Tenants affected: <tenant IDs>
   Started: <timestamp>
   Action taken: <rollback / stop / other>
   On-call: <name>
   ```
7. **GDPR breach assessment**: if patient data may have been exposed, lost, or corrupted, notify the DPO immediately (`<TODO: DPO name/email>`) and assess ICO notification. UK GDPR Article 33 — the 72-hour reporting clock starts at the moment of awareness.

---

## What to Monitor Daily

| Signal                          | Where to look                                          | Action if bad                                                                   |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Staff review alert emails       | Email inbox                                            | Open dashboard, action items                                                    |
| Pilot preflight blocking checks | `GET /api/onboarding/pilot-preflight`                  | Resolve blockers before calls start                                             |
| Reconciliation failures         | Staff review dashboard (type: `reconciliation_failed`) | Manually verify appointment vs calendar                                         |
| Worker health                   | Preflight response → `workerHealth`                    | Check server/worker logs; restart if needed                                     |
| Media-stream failures           | Preflight response → `recentMediaStreamFailures`       | < 25: monitor. ≥ 25: blocking — check Twilio and server logs before calls start |
| Appointment ledger drift        | Reconciliation processor logs                          | Investigate drift; do not auto-resolve                                          |

---

## Known Limitations (Pilot-Acceptable)

- **No autonomous booking cancellation** — by design. Staff must confirm every cancel/reschedule.
- **Single-tenant notification recipient** — alerts go to the clinic's primary email (from clinic profile). Individual staff inboxes not yet supported.
- **No real-time staff alert** — alerts are polled every hour. A 30–60 min lag is expected for non-urgent items.
- **Google Calendar PHI scrub is manual** — this is intentional for the pilot. There is no auto-remediation.
- **Verification strength varies** — phone+DOB+datetime is stronger than confirmation-ID only. Weak verifications are flagged in staff review metadata.
- **No SMS/push notifications** — email only.
- **No autonomous operation** — this system is not cleared for unattended autonomous mode. Staff supervision is required at all times during pilot.
