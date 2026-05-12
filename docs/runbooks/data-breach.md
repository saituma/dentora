# Data Breach Response Runbook

**Owner**: Security / Engineering Lead  
**Regulatory context**: UK GDPR Article 33 (72-hour ICO notification) + Article 34 (subject notification)  
**Last reviewed**: 2026-05

---

## 1. Detection

Signs of a breach:

- Unusual database query volumes or after-hours access in audit logs
- Unrecognised API key usage or admin logins from unknown IPs
- Customer reports of unexpected calls or data disclosure
- Alerts from Datadog/Sentry for mass data reads or export endpoints

**Immediately on suspicion**: open a private Slack incident channel `#incident-YYYY-MM-DD` and page the security lead.

---

## 2. Containment (first 30 minutes)

| Step | Action                                   | Command / Location                                                                                |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2.1  | Revoke all active sessions               | `DELETE FROM sessions WHERE expires_at > NOW();`                                                  |
| 2.2  | Rotate JWT_SECRET                        | `npx tsx apps/server/scripts/rotate-secrets.ts --jwt` then restart server                         |
| 2.3  | Block suspicious IPs                     | UFW: `ufw deny from <ip>` or Cloudflare IP block rule                                             |
| 2.4  | Disable compromised API keys             | Mark `api_key_status = 'revoked'` in `api_keys` table                                             |
| 2.5  | Take server offline if breach is ongoing | `docker-compose -f docker-compose.prod.yaml stop server`                                          |
| 2.6  | Snapshot the Droplet immediately         | DigitalOcean dashboard → Droplet → Snapshots → Take snapshot                                      |
| 2.7  | Preserve Postgres logs                   | `docker-compose -f docker-compose.prod.yaml logs postgres > /tmp/postgres-breach-$(date +%s).log` |

---

## 3. Assessment (first 2 hours)

Answer these questions before notification:

1. **What data was accessed?** (patient PII, call recordings, financial, credentials)
2. **How many data subjects affected?** (count patient_profiles for the tenantId(s))
3. **Which tenants affected?** (list from audit_log)
4. **Was data exfiltrated or only accessed?** (check network egress logs, egress bytes in Datadog)
5. **Is the breach ongoing or contained?**
6. **How did it happen?** (compromised credentials, code vuln, misconfiguration)
7. **High risk to individuals?** (financial fraud likely? identity theft possible?)

Document answers in the `#incident-YYYY-MM-DD` channel pinned post.

---

## 4. ICO Notification (within 72 hours of awareness)

**UK GDPR Article 33**: Notify the ICO within 72 hours unless the breach is "unlikely to result in a risk to the rights and freedoms of natural persons."

Dental patient data (names, DOB, phone numbers, call recordings) is **likely to qualify** — notify unless the breach was fully contained and no plaintext data was accessed.

### How to notify:

1. Go to **report.ico.org.uk** (ICO online breach report tool)
2. Use ICO reference number from your registration (stored in `docs/compliance/dpa-tracker.md`)
3. Required information:
   - Nature of the breach (unauthorised access / disclosure / loss)
   - Categories and approximate number of data subjects
   - Categories and approximate number of records
   - Likely consequences of the breach
   - Measures taken or proposed to address the breach

**72-hour clock starts** from when you became "aware" — not from when the breach occurred. Document your awareness time in the incident channel immediately.

If you cannot provide complete information within 72 hours, notify the ICO with what you have and state that further information will follow.

---

## 5. Subject Notification (if high risk)

**UK GDPR Article 34**: Notify affected individuals "without undue delay" if the breach is likely to result in a high risk to their rights and freedoms.

Dental data (health context + financial) typically requires subject notification.

Template (send via email to clinic contacts, who notify their patients):

```
Subject: Important notice about your data

We are writing to inform you that [Dentora/Clinic Name] experienced a data security incident
on [date] that may have affected your personal information.

What happened: [brief description]
What information was involved: [name, date of birth, phone number, call records]
What we are doing: [steps taken to contain and prevent recurrence]
What you should do: [e.g., be alert to phishing, monitor for fraud]

If you have questions, contact us at [support email].

[Name], [Title]
Dentora / [Clinic Name]
```

---

## 6. Remediation

- Root cause analysis documented in `#incident-YYYY-MM-DD`
- Fix deployed and verified before bringing server back online
- Rotate ENCRYPTION_KEY if PHI rows were accessed (see rotate-secrets.ts)
- Review and update access controls, rate limits, WAF rules
- Conduct post-incident review within 5 business days
- Update threat model in `docs/compliance/`

---

## 7. Record Keeping

UK GDPR requires documenting ALL breaches (Article 33(5)), even those not reported to ICO.

Store in `docs/compliance/breach-register.md`:

- Date and time of breach / awareness
- Nature of breach
- Data subjects and records affected
- ICO notification date (or reason not notified)
- Subject notification date (or reason not notified)
- Remediation steps taken

Retain for minimum **3 years**.

---

## Key contacts

| Role                                 | Contact                   |
| ------------------------------------ | ------------------------- |
| ICO Helpline                         | 0303 123 1113             |
| ICO Online Report                    | report.ico.org.uk         |
| Twilio (if breach via their systems) | security@twilio.com       |
| DigitalOcean Security                | security@digitalocean.com |
