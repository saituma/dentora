# Appointment Reminders — Pre-Launch Runbook

How to take SMS + WhatsApp appointment reminders from "built and dormant" to live, safely.

> ⚠️ **This repo's dev `.env` points at the LIVE production DB / Redis / Twilio.** Treat every
> local action as production. The steps below are ordered so nothing sends a real message until
> you explicitly turn off dry-run.

The feature ships behind three independent safety gates — all must be cleared before a single
real reminder goes out:

1. `FF_APPOINTMENT_REMINDERS` (feature flag) — off by default.
2. `TWILIO_DRY_RUN` — when `true`, messages are logged, never sent.
3. **Patient consent** — a reminder is dropped unless the patient has `messaging_consent = true`.

---

## 0. Prerequisites

- [ ] Migration `0028_brief_khan.sql` reviewed (adds `appointment_reminders` table + four
      `patient_profiles` consent columns; additive only, no destructive changes).
- [ ] A Twilio number with **SMS capability enabled** for the pilot tenant
      (`twilio_numbers.capabilities.sms = true`).
- [ ] (WhatsApp only) A Twilio-approved WhatsApp Business sender.

---

## 1. Apply the migration

```bash
# Review first
cat apps/server/drizzle/0028_brief_khan.sql

# Apply to prod (drizzle-kit migrate runs at deploy via the Heroku release phase,
# or run manually against the prod DB):
pnpm db:migrate
```

Verify: `appointment_reminders` exists and `patient_profiles` has `messaging_consent`,
`messaging_consent_at`, `messaging_opted_out_at`, `preferred_reminder_channel`.

---

## 2. Set environment variables (Heroku config)

```bash
# Safety: keep dry-run ON until step 5.
TWILIO_DRY_RUN=true

# WhatsApp sender (E.164, NO "whatsapp:" prefix). Omit to run SMS-only.
TWILIO_WHATSAPP_FROM=+447700900123

# Optional: route SMS through a Messaging Service sender pool instead of the from-number.
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx

# Leave the feature flag OFF for now (do not set, or set to false).
# FF_APPOINTMENT_REMINDERS=false
```

> **WhatsApp caveat:** outside the 24-hour customer-service window, WhatsApp requires a
> pre-approved message template. The reminder sends a plain body, which works in-window and in
> dry-run. Get a template approved before relying on WhatsApp for cold reminders.

---

## 3. Capture consent for the pilot

Reminders only send to consented patients. Three ways consent gets recorded:

- **Dashboard** — patient detail page → "Appointment reminders" toggle (+ channel select).
- **In-call** — the AI receptionist asks "Would you like a text reminder?" after booking and
  calls the `set_reminder_consent` tool. (Requires the agent prompt `V11` / re-patched agent.)
- **API** — `POST /api/patients/:id/consent` `{ consent: true, preferredChannel: "sms" }`.

For the pilot, set consent on a handful of test patients (ideally your own numbers).

---

## 4. Enable the flag with dry-run still ON

```bash
FF_APPOINTMENT_REMINDERS=true   # TWILIO_DRY_RUN is still true
```

Book a test appointment for a consented patient ~25h out (so the 24h reminder schedules).
Confirm in logs you see the scheduler enqueue a job, and — when it fires — a line like:

```
TWILIO_DRY_RUN active — message not actually sent  { channel: "sms", to: "+4477****0123" }
```

Check the **Reminders** dashboard page: the row should show status `sent` with `dryRun` noted in
metadata. No real message should have arrived.

---

## 5. Go live (turn off dry-run)

```bash
TWILIO_DRY_RUN=false
```

Book one more real test appointment to your own phone. Confirm the message actually arrives and
the dashboard shows `sent`. 🎉

---

## 6. Monitor

- **Reminders dashboard** (`/dashboard/reminders`) — status per reminder; watch for `failed`.
- **Logs** — `Reminder message sent`, `Reminder skipped — …`, `Reminder send failed: …`.
- **Skipped reasons** worth noting: `no_consent` (expected for non-consented), `opted_out`,
  `no_active_sms_capable_number` (Twilio number lacks SMS), `appointment_cancelled`.
- Failed sends retry automatically (BullMQ, 3 attempts) before landing in the dead-letter queue.

---

## 7. Rollback

Instant kill switch — no deploy needed if you can set config vars:

```bash
FF_APPOINTMENT_REMINDERS=false   # stops all new scheduling immediately
# or, to keep scheduling but stop sending:
TWILIO_DRY_RUN=true
```

Already-enqueued jobs will no-op on the consent/flag checks at send time. The migration is
additive and safe to leave in place.
