import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const activeCallsGauge = new client.Gauge({
  name: 'active_calls',
  help: 'Number of currently active voice calls',
  registers: [register],
});

export const callDurationHistogram = new client.Histogram({
  name: 'call_duration_seconds',
  help: 'Duration of completed voice calls',
  labelNames: ['tenant_id', 'status'],
  buckets: [10, 30, 60, 120, 300, 600, 1200, 1800],
  registers: [register],
});

export const callsTotal = new client.Counter({
  name: 'calls_total',
  help: 'Total calls by outcome',
  labelNames: ['status', 'end_reason'],
  registers: [register],
});

export const providerRequestDuration = new client.Histogram({
  name: 'provider_request_duration_seconds',
  help: 'Duration of AI provider requests',
  labelNames: ['provider', 'workload_type'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
  registers: [register],
});

export const providerRequestsTotal = new client.Counter({
  name: 'provider_requests_total',
  help: 'Total AI provider requests',
  labelNames: ['provider', 'workload_type', 'success'],
  registers: [register],
});

export const providerFailoversTotal = new client.Counter({
  name: 'provider_failovers_total',
  help: 'Total provider failover events',
  labelNames: ['workload_type', 'from_provider', 'to_provider'],
  registers: [register],
});

export const tokensUsedTotal = new client.Counter({
  name: 'tokens_used_total',
  help: 'Total LLM tokens consumed',
  labelNames: ['provider', 'direction'],
  registers: [register],
});

export const conversationTurnDuration = new client.Histogram({
  name: 'conversation_turn_duration_seconds',
  help: 'End-to-end latency of a single conversation turn (STT→LLM→TTS)',
  labelNames: ['tenant_id'],
  buckets: [0.5, 1, 1.5, 2, 3, 5, 10],
  registers: [register],
});

export const turnLatencyByStage = new client.Histogram({
  name: 'turn_latency_by_stage_seconds',
  help: 'Latency by processing stage',
  labelNames: ['stage'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const bookingConversionTotal = new client.Counter({
  name: 'booking_conversion_total',
  help: 'Booking conversion outcomes',
  labelNames: ['outcome'],
  registers: [register],
});

export const onboardingReadinessGauge = new client.Gauge({
  name: 'onboarding_readiness_score',
  help: 'Current readiness score by tenant',
  labelNames: ['tenant_id'],
  registers: [register],
});

export const callCostHistogram = new client.Histogram({
  name: 'call_cost_usd',
  help: 'Cost per call in USD',
  labelNames: ['tenant_id'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const circuitBreakerOpenTotal = new client.Counter({
  name: 'circuit_breaker_open_total',
  help: 'Number of times a circuit breaker transitioned to open',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerRejectedTotal = new client.Counter({
  name: 'circuit_breaker_rejected_total',
  help: 'Number of requests rejected because the circuit breaker is open',
  labelNames: ['service'],
  registers: [register],
});

// ── Business metrics ──────────────────────────────────────────────────────────

export const callsPerTenantTotal = new client.Counter({
  name: 'calls_per_tenant_total',
  help: 'Total calls per tenant',
  labelNames: ['tenant_id', 'status'],
  registers: [register],
});

export const failedWebhooksTotal = new client.Counter({
  name: 'failed_webhooks_total',
  help: 'Total webhook processing failures',
  labelNames: ['source', 'reason'],
  registers: [register],
});

export const bullmqJobsTotal = new client.Counter({
  name: 'bullmq_jobs_total',
  help: 'Total BullMQ jobs processed',
  labelNames: ['queue', 'outcome'],
  registers: [register],
});

export const dsarExportsTotal = new client.Counter({
  name: 'dsar_exports_total',
  help: 'Total GDPR data subject access request exports',
  labelNames: ['tenant_id'],
  registers: [register],
});

export const patientDeletionsTotal = new client.Counter({
  name: 'patient_deletions_total',
  help: 'Total GDPR right-to-erasure deletions',
  labelNames: ['tenant_id'],
  registers: [register],
});

export { register };

export function getMetricsContentType(): string {
  return register.contentType;
}

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
