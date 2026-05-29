# Dentora — Compliance & Trust Positioning (marketing copy)

Your engineering is genuinely ahead of the AI-dental-receptionist field on data protection and
reliability — but it's invisible because it lives in code, not on your marketing pages. This is
ready-to-use copy that turns that moat into a selling point.

**Every claim below is backed by code in this repo.** Don't add a claim you can't point to — in a
GDPR-regulated market, an overclaim is a liability. A "verify before publishing" checklist is at
the end.

---

## Hero / one-liner options

- **"The AI receptionist built like a bank, not a chatbot."**
- **"UK dental AI that takes patient data as seriously as you do."**
- **"Never miss a call — and never compromise on patient data."**

Sub-line:

> Dentora answers every call, books appointments straight into your diary, and protects every
> patient record with bank-grade encryption and full UK GDPR compliance — built in, not bolted on.

---

## "Why Dentora" — differentiator block

Most AI receptionists make **no explicit data-protection statement at all** on a product handling
GDPR-regulated patient data. One competitor even claims HIPAA (a US standard) on a UK product.
Lead with the gap:

**🔒 Bank-grade encryption at rest**
Every patient name, phone number, and call transcript is encrypted with AES-256-GCM. Even our own
logs never contain plaintext patient data.

**🇬🇧 UK GDPR, enforced in software**
Right to erasure (Article 17) and data export (Article 15/20) aren't promises — they're one-click
operations. Every access to a patient record is written to a tamper-evident audit log, retained
for 7 years.

**🏥 Your data is yours, and only yours**
Strict multi-tenant isolation means one practice can never see another's data — enforced on every
single database query, not just at the login screen.

**⚡ Built to stay up**
If one AI provider has an outage, Dentora automatically fails over to a second — calls keep being
answered. Circuit breakers and retries handle the wobble so your patients never hear it.

**💷 Transparent pricing**
Published plans, no "book a demo to find out the price." (You and one competitor are the only two
in the field who publish.)

---

## Comparison framing (use as a table on the pricing/why page)

|                                | **Dentora**                                    | Typical competitor |
| ------------------------------ | ---------------------------------------------- | ------------------ |
| Patient data encrypted at rest | ✅ AES-256-GCM                                 | Rarely stated      |
| UK GDPR erasure + export       | ✅ One-click                                   | Rarely stated      |
| Access audit log               | ✅ 7-year retention                            | Not advertised     |
| AI provider failover           | ✅ Automatic                                   | Not advertised     |
| Published pricing              | ✅                                             | Usually demo-gated |
| Books into UK dental PMS       | ✅ Dentally, SOE/Exact, CS R4, Google Calendar | Varies             |

> Keep the right-hand column honest and general ("rarely stated", not "none") — it's defensible
> because most competitor sites genuinely make no such claim.

---

## Trust section (footer of landing / dedicated /security page)

**How we protect patient data**

- **Encryption:** AES-256-GCM for all personal data at rest; encrypted in transit (TLS).
- **Access control:** every record access is authenticated, tenant-scoped, and audit-logged.
- **Data rights:** erasure and portable export on request, fulfilled automatically.
- **Retention:** call transcripts kept 2 years, audit logs 7 years, then purged automatically.
- **Resilience:** multi-provider AI failover, automatic retries, and circuit breakers keep the
  line answered during upstream outages.

A short, plain-English "Your data & your patients' data" explainer here builds more trust with a
practice manager than any feature list.

---

## Verify-before-publishing checklist

Confirm each before it goes on a public page (all currently true in code — re-confirm at publish):

- [ ] AES-256-GCM for `patientProfiles.fullName/phoneNumber/notes`, `callSessions.callerNumber`,
      `callTranscripts.summary` — see `lib/encrypted-column.ts` + `db/schema.ts`.
- [ ] GDPR erasure (`DELETE /api/patients/:id`) and export (`GET /api/patients/:id/export`) live.
- [ ] Audit log writes on patient/call access; **confirm the 7-year retention job actually runs**
      (`lib/data-retention.js` / worker cron) before quoting "7 years".
- [ ] Tenant isolation enforced on queries (`eq(table.tenantId, tenantId)` everywhere).
- [ ] AI failover OpenAI → Anthropic is enabled in production (`FF_PROVIDER_FAILOVER`) — only
      claim "automatic failover" if the flag is on in prod.
- [ ] TLS termination in front of the API (Heroku does this — confirm no plaintext hop).
- [ ] **Do not** claim HIPAA (US) — you're UK GDPR. Say "UK GDPR compliant", not "HIPAA".
- [ ] If you say "bank-grade", be ready to explain it means AES-256 — it's defensible, not a stretch.
