# Data Processing Agreement Tracker

**Regulation**: UK GDPR Article 28 — all processors handling personal data on behalf of Dentora must have a signed DPA.  
**Last reviewed**: 2026-05

---

## ICO Registration

| Field         | Value                                                     |
| ------------- | --------------------------------------------------------- |
| Status        | **ACTION REQUIRED** — register at ico.org.uk/registration |
| Fee           | £40–60/year (Tier 1 micro-organisation)                   |
| ICO Reference | _to be filled in after registration_                      |
| Renewal date  | _annual_                                                  |

---

## Processor DPA Status

| Vendor           | Role                     | Data processed                                          | DPA Location                                                                                                       | Status                                     |
| ---------------- | ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **DigitalOcean** | Infrastructure / hosting | All data (Droplet, Spaces, Managed DB)                  | [DigitalOcean DPA](https://www.digitalocean.com/legal/data-processing-agreement) — self-service via account portal | ⬜ Sign via account → Settings → Legal     |
| **Twilio**       | Telephony / call routing | Caller phone numbers, call audio, call SIDs             | [Twilio DPA](https://www.twilio.com/legal/data-protection-addendum) — self-service via console                     | ⬜ Sign via Twilio Console → Compliance    |
| **ElevenLabs**   | Text-to-speech           | Call audio (synthetic voice, no patient PII in prompts) | [ElevenLabs DPA](https://elevenlabs.io/dpa) — contact sales or self-service                                        | ⬜ Request via ElevenLabs support          |
| **OpenAI**       | LLM / AI processing      | Call transcripts, intent summaries                      | [OpenAI DPA](https://openai.com/policies/data-processing-addendum) — self-service in API portal                    | ⬜ Sign via platform.openai.com → Settings |
| **Deepgram**     | Speech-to-text           | Call audio, transcripts                                 | [Deepgram DPA](https://deepgram.com/dpa) — contact support                                                         | ⬜ Request via Deepgram support            |
| **Vercel**       | Frontend hosting         | No patient data (static Next.js frontend only)          | [Vercel DPA](https://vercel.com/legal/dpa) — self-service                                                          | ⬜ Sign via Vercel dashboard → Settings    |
| **Resend**       | Transactional email      | User email addresses (staff, not patients)              | [Resend DPA](https://resend.com/legal/dpa) — self-service                                                          | ⬜ Sign via Resend dashboard               |
| **Sentry**       | Error monitoring         | Stack traces, possibly request metadata                 | [Sentry DPA](https://sentry.io/legal/dpa/) — self-service                                                          | ⬜ Sign via Sentry org settings            |
| **Datadog**      | APM / logging            | Server logs, traces (scrub patient PII before sending)  | [Datadog DPA](https://www.datadoghq.com/legal/data-processing-addendum/) — contact sales                           | ⬜ Request via Datadog support             |

---

## Transfer Mechanism (UK → US vendors)

Post-Brexit, UK-to-US transfers require a lawful transfer mechanism. Options:

1. **UK IDTA** (International Data Transfer Agreement) — the UK equivalent of SCCs. Most US vendors include this in their DPA.
2. **UK-US Data Bridge** — the UK's adequacy arrangement with the US (analogous to EU-US DPF). Vendors certified under UK Extension to DPF qualify.

**Action**: When signing each DPA, confirm it includes the UK IDTA or confirm the vendor is certified under the UK Extension to the EU-US Data Privacy Framework.

Check certification status at: [dpf.gov.ec.europa.eu](https://www.dataprivacyframework.gov/s/participant-search)

---

## UK GDPR Article 28 Requirements (verify each DPA covers)

- [ ] Processes personal data only on documented instructions
- [ ] Confidentiality obligations on personnel
- [ ] Appropriate technical and organisational security measures (Article 32)
- [ ] Sub-processor approval and same obligations apply downstream
- [ ] Assists controller with data subject rights requests
- [ ] Assists with security obligations, breach notification, DPIA
- [ ] Deletes or returns data at end of contract
- [ ] Provides all information necessary to demonstrate compliance, allows audits

---

## Internal processing activities (no DPA required, document in ROPA)

| Activity                           | Legal basis                                               | Retention                                          |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Patient profile (name, DOB, phone) | Legitimate interest (appointment management)              | Until erasure request or 2 years post-last-contact |
| Call recordings / transcripts      | Legitimate interest (service quality, dispute resolution) | 2 years (per data retention policy)                |
| Staff user accounts                | Contract performance                                      | Duration of employment + 1 year                    |
| Audit logs                         | Legitimate interest (security, compliance)                | 7 years                                            |
| Billing / Stripe data              | Legal obligation (tax records)                            | 7 years                                            |

_ROPA = Record of Processing Activities (Article 30) — maintain a separate spreadsheet for ICO inspection._
