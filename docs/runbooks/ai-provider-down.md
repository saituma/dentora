# Runbook: AI Provider Down

Covers: OpenAI, Anthropic, ElevenLabs, Deepgram. Each has a circuit breaker that opens after 5 failures within 60s, then resets after 30s.

---

## 1. Identify the failing provider

```bash
# Check circuit breaker metrics
# In Datadog: sum by service (circuit_breaker_open_total)

# Or check logs
docker-compose -f docker-compose.prod.yaml logs server | grep "circuit.breaker\|provider"
```

Metrics to watch:

- `circuit_breaker_open_total{service="openai|anthropic|elevenlabs|deepgram"}`
- `provider_request_duration_seconds` — p99 spike indicates slowness before failure
- `provider_requests_total{success="false"}`

---

## 2. Provider status pages

| Provider   | Status page          |
| ---------- | -------------------- |
| OpenAI     | status.openai.com    |
| Anthropic  | status.anthropic.com |
| ElevenLabs | status.elevenlabs.io |
| Deepgram   | status.deepgram.com  |

---

## 3. Impact by provider

| Provider                     | Impact when down                                                      |
| ---------------------------- | --------------------------------------------------------------------- |
| **OpenAI / Anthropic** (LLM) | AI receptionist cannot generate responses — calls fail after greeting |
| **Deepgram** (STT)           | Cannot transcribe caller speech — calls fail immediately              |
| **ElevenLabs** (TTS)         | Cannot synthesise voice — calls fail after first response             |

All failures are caught by circuit breakers — active calls will hear an error message and the call ends gracefully rather than hanging.

---

## 4. During an outage

The circuit breaker handles transient failures automatically (30s reset, half-open probe). For extended outages (> 5 min):

1. Check if there's a fallback provider configured (the AI provider system supports failover)
2. If no fallback: consider routing calls to a human operator via Twilio Studio
3. Post status on clinic voicemail if outage > 30 min

---

## 5. API key issues (not a provider outage)

If only your account is affected (401/403 errors):

```bash
# Check logs for 401
docker-compose -f docker-compose.prod.yaml logs server | grep "401\|403\|unauthorized\|invalid key"

# Regenerate and update in .env.production, then:
docker-compose -f docker-compose.prod.yaml restart server worker
```

---

## 6. After recovery

- Circuit breaker will auto-reset within 30s of provider returning healthy responses
- Verify: `circuit_breaker_open_total` stops incrementing for affected service
- Check `provider_requests_total{success="true"}` resumes
