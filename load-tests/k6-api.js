/**
 * k6 API load test — simulates 1k concurrent users hitting the Dentora REST API.
 *
 * Usage:
 *   k6 run load-tests/k6-api.js
 *   k6 run --vus 100 --duration 60s load-tests/k6-api.js
 *   BASE_URL=https://yourprod.com k6 run load-tests/k6-api.js
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *
 * Prerequisites: set env vars or hardcode test credentials below.
 *   K6_BASE_URL   — API base URL (default: http://localhost:3001)
 *   K6_EMAIL      — test user email
 *   K6_PASSWORD   — test user password
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3001';
const EMAIL = __ENV.K6_EMAIL || 'test@example.com';
const PASSWORD = __ENV.K6_PASSWORD || 'testpassword123';

export const options = {
  scenarios: {
    // Ramp up to 1k VUs over 2 minutes, hold for 5 min, ramp down
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // SLO: p95 < 500ms, error rate < 1%
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    api_errors: ['count<50'],
  },
};

// ── Custom metrics ────────────────────────────────────────────────────────────

const apiErrors = new Counter('api_errors');
const callsListDuration = new Trend('calls_list_duration');
const patientsListDuration = new Trend('patients_list_duration');
const configReadDuration = new Trend('config_read_duration');
const cacheHitRate = new Rate('cache_hit_rate');

// ── Auth helper ───────────────────────────────────────────────────────────────

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (!check(res, { 'login 200': (r) => r.status === 200 })) {
    apiErrors.add(1);
    return null;
  }

  const body = res.json();
  return body.accessToken;
}

// ── Main test ─────────────────────────────────────────────────────────────────

export default function () {
  const token = login();
  if (!token) {
    sleep(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  group('calls list (cursor pagination)', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/calls?limit=20`, { headers });
    callsListDuration.add(Date.now() - start);

    const ok = check(res, {
      'calls 200': (r) => r.status === 200,
      'has nextCursor field': (r) => {
        const b = r.json();
        return b !== null && typeof b === 'object' && 'nextCursor' in b;
      },
    });
    if (!ok) apiErrors.add(1);

    // Follow next page if cursor exists
    const body = res.json();
    if (body && body.nextCursor) {
      const page2 = http.get(`${BASE_URL}/api/calls?limit=20&cursor=${body.nextCursor}`, { headers });
      check(page2, { 'calls page2 200': (r) => r.status === 200 });
    }
  });

  group('patients list', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/patients?limit=20`, { headers });
    patientsListDuration.add(Date.now() - start);

    const ok = check(res, { 'patients 200': (r) => r.status === 200 });
    if (!ok) apiErrors.add(1);
  });

  group('clinic config (cached)', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/config/clinic`, { headers });
    configReadDuration.add(Date.now() - start);

    const ok = check(res, { 'config 200': (r) => r.status === 200 });
    if (!ok) apiErrors.add(1);

    // Check if served from cache (fast response = likely cached)
    cacheHitRate.add(res.timings.duration < 50 ? 1 : 0);
  });

  group('health check', () => {
    const res = http.get(`${BASE_URL}/api/health/ready`);
    check(res, { 'health 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}

export function handleSummary(data) {
  return {
    'load-tests/results/api-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const indent = opts.indent || '';
  const lines = [`${indent}=== k6 API Load Test Summary ===`];
  const metrics = data.metrics;

  if (metrics.http_req_duration) {
    const d = metrics.http_req_duration.values;
    lines.push(`${indent}HTTP Duration: p50=${d['p(50)'].toFixed(0)}ms p95=${d['p(95)'].toFixed(0)}ms p99=${d['p(99)'].toFixed(0)}ms`);
  }
  if (metrics.http_req_failed) {
    lines.push(`${indent}Error rate: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  }
  if (metrics.http_reqs) {
    lines.push(`${indent}Total requests: ${metrics.http_reqs.values.count}`);
    lines.push(`${indent}RPS: ${metrics.http_reqs.values.rate.toFixed(1)}`);
  }

  return lines.join('\n');
}
