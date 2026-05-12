# Runbook: Twilio Down / Call Failures

**Symptoms**: Inbound calls not being answered, `calls_total{status="failed"}` spiking, Twilio webhook errors in logs.

---

## 1. Check Twilio status

- **Status page**: status.twilio.com (check Voice / UK region)
- **Twilio Console**: console.twilio.com → Monitor → Logs → Calls

---

## 2. Diagnose from logs

```bash
docker-compose -f docker-compose.prod.yaml logs server | grep -i "twilio\|webhook\|voice"
```

Common error patterns:

- `11200 HTTP retrieval failure` — Twilio cannot reach your webhook URL
- `11750 TwiML response body too large` — TwiML response issue
- `13227 Geographic Permission for the dialed number is not enabled`

---

## 3. Webhook URL unreachable

If Twilio can't reach your server:

1. Verify nginx is running: `docker-compose -f docker-compose.prod.yaml ps nginx`
2. Check SSL cert is valid: `curl -v https://yourdomain.com/api/health`
3. Verify webhook URL in Twilio Console matches your domain
4. Re-run: `npx tsx apps/server/scripts/sync-twilio-webhooks.ts`

---

## 4. Circuit breaker open (Twilio API calls failing)

The circuit breaker opens after 5 failures in 60s. Check:

```
circuit_breaker_open_total{service="twilio"}
```

If open, calls will fail fast for 30s then retry (half-open). If Twilio itself is down, this is correct behaviour — calls fail quickly rather than hanging.

---

## 5. Fallback behaviour during outage

During a Twilio outage:

- Inbound calls receive Twilio's default "service unavailable" message
- No data is lost — calls never reached our system
- No action needed beyond monitoring

If the outage is extended (> 30 min), consider posting on your clinic's website/voicemail that the AI receptionist is temporarily unavailable and to call back later.

---

## 6. After recovery

- Verify new calls appear in Twilio Console → Logs
- Check `active_calls` gauge returns to normal
- Verify circuit breaker has closed: `circuit_breaker_open_total{service="twilio"}` stops incrementing
