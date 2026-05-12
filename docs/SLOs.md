# Service Level Objectives

**Service**: Dentora API  
**Measurement window**: 30-day rolling  
**Last reviewed**: 2026-05

---

## SLO 1 — API Availability

|                 | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| **Target**      | 99.9% (≤ 43.8 min downtime/month)                                       |
| **Indicator**   | % of `/api/health/ready` probes returning 2xx                           |
| **Measurement** | Datadog Synthetic Monitor → `dentora-api-health` (every 60s, 5 regions) |
| **Alert**       | Page on-call if availability drops below 99.5% over any 1-hour window   |

Error budget: **43.8 minutes/month**. Burn rate alert: page at 5× burn (reaches budget in 6 days).

---

## SLO 2 — API Latency (p95)

|               | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| **Target**    | p95 HTTP response time ≤ 500ms                                            |
| **Indicator** | 95th percentile of `http_request_duration_seconds` (Prometheus / Datadog) |
| **Excludes**  | `/api/health*`, WebSocket upgrade requests, media-stream endpoints        |
| **Alert**     | Warn if p95 > 500ms sustained 5 min; page if p95 > 2s                     |

---

## SLO 3 — AI Call Answer Rate

|               | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| **Target**    | ≥ 95% of inbound calls answered by the AI receptionist within 3 rings     |
| **Indicator** | `calls_total{status="completed"}` / `calls_total` (all terminal statuses) |
| **Alert**     | Page if answer rate < 90% over any 15-minute window                       |

---

## SLO 4 — Booking Conversion Accuracy

|               | Value                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **Target**    | ≥ 90% of booking intents result in a confirmed or attempted booking                                |
| **Indicator** | `booking_conversion_total{outcome="confirmed"}` / `booking_conversion_total{outcome!="no_intent"}` |
| **Alert**     | Warn if conversion drops below 80% over any 1-hour window                                          |

---

## SLO 5 — Error Rate

|               | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| **Target**    | ≤ 1% 5xx error rate on all non-health API endpoints               |
| **Indicator** | `http_requests_total{status_code=~"5.."}` / `http_requests_total` |
| **Alert**     | Page if 5xx rate exceeds 5% over 5 minutes                        |

---

## Alerting Policy

All alerts go to the on-call rotation. Severity:

| Level     | Condition                                                  | Channel                 |
| --------- | ---------------------------------------------------------- | ----------------------- |
| P1 (page) | SLO breach imminent (> 2× burn rate) or availability < 99% | PagerDuty → SMS         |
| P2 (warn) | Elevated error rate or latency, not yet breaching          | Slack `#alerts-dentora` |
| P3 (info) | Circuit breaker open, DLQ jobs received                    | Slack `#alerts-dentora` |

---

## On-call runbooks

- [DB down](runbooks/db-down.md)
- [Redis down](runbooks/redis-down.md)
- [Twilio down](runbooks/twilio-down.md)
- [AI provider down](runbooks/ai-provider-down.md)
- [Certificate expiry](runbooks/cert-expiry.md)
- [Data breach](runbooks/data-breach.md)
