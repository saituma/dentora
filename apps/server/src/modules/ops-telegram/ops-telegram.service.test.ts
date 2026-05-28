import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock every external dependency so nothing touches the prod-wired DB/Redis ──
const sendTelegramMessage = vi.hoisted(() => vi.fn(async (_text: string) => undefined));
const getCircuitBreakerStatusShared = vi.hoisted(() => vi.fn());
const opsDailyCost = vi.hoisted(() => vi.fn());
const opsCostByProvider = vi.hoisted(() => vi.fn());
const opsTopTenants = vi.hoisted(() => vi.fn());
const getJobCounts = vi.hoisted(() => vi.fn(async () => ({ waiting: 0, failed: 0 })));
const redisMock = vi.hoisted(() => ({
  keys: vi.fn(async () => [] as string[]),
  get: vi.fn(async () => null),
  ping: vi.fn(async () => 'PONG'),
}));

vi.mock('../../db/index.js', () => ({
  db: {},
  checkDbHealth: vi.fn(async () => true),
}));
vi.mock('../../lib/cache.js', () => ({ getRedis: () => redisMock }));
vi.mock('../../lib/queue.js', () => ({
  getQueue: () => ({ getJobCounts }),
  QUEUE_NAMES: { DEAD_LETTER: 'dead-letter', COST_ATTRIBUTION: 'cost-attribution' },
}));
vi.mock('../../lib/circuit-breaker.js', () => ({ getCircuitBreakerStatusShared }));
vi.mock('../../lib/telegram.js', () => ({
  sendTelegramMessage,
  isTelegramConfigured: () => true,
}));
vi.mock('../admin/admin-log-stream.js', () => ({
  logEmitter: new EventEmitter(),
  getRecentLogs: () => [],
}));
vi.mock('../operational-health/operational-health.service.js', () => ({
  getOperationalHealthSnapshot: vi.fn(async () => null),
  APPOINTMENT_MAINTENANCE_COMPONENT: 'appointment_maintenance',
}));
vi.mock('../analytics/analytics.service.js', () => ({
  getOpsDailyCost: opsDailyCost,
  getOpsCostByProvider: opsCostByProvider,
  getOpsTopTenants: opsTopTenants,
}));

import {
  escapeHtml,
  setMute,
  clearMute,
  isMuted,
  buildCostReport,
  buildTenantsReport,
  runHealthWatch,
} from './ops-telegram.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  clearMute();
  getCircuitBreakerStatusShared.mockResolvedValue({});
  getJobCounts.mockResolvedValue({ waiting: 0, failed: 0 });
  redisMock.keys.mockResolvedValue([]);
});

describe('escapeHtml', () => {
  it('escapes &, <, > so Telegram HTML mode accepts the message', () => {
    expect(escapeHtml('a & b <tag> "x"')).toBe('a &amp; b &lt;tag&gt; "x"');
  });
});

describe('mute', () => {
  it('toggles mute state', () => {
    expect(isMuted()).toBe(false);
    setMute(5);
    expect(isMuted()).toBe(true);
    clearMute();
    expect(isMuted()).toBe(false);
  });
});

describe('buildCostReport', () => {
  it('renders today total, trend and provider breakdown, escaping provider names', async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    opsDailyCost.mockResolvedValue([{ day: todayKey, cost: 12.5 }]);
    opsCostByProvider.mockResolvedValue([{ provider: 'openai <gpt>', cost: 9.25 }]);

    const out = await buildCostReport();
    expect(out).toContain('Today: <b>$12.50</b>');
    expect(out).toContain('$9.25');
    expect(out).toContain('openai &lt;gpt&gt;');
  });
});

describe('buildTenantsReport', () => {
  it('ranks clinics and escapes clinic names', async () => {
    opsTopTenants.mockResolvedValue([{ clinicName: 'Bright & Co', calls: 7, cost: 3.1 }]);
    const out = await buildTenantsReport();
    expect(out).toContain('1. <b>Bright &amp; Co</b> — 7 calls · $3.10');
  });
});

describe('runHealthWatch edge-triggering', () => {
  it('alerts once when a breaker opens, stays silent while open, alerts on recovery', async () => {
    // First poll: breaker open → one alert
    getCircuitBreakerStatusShared.mockResolvedValue({
      openai: { state: 'open', failures: 6 },
    });
    await runHealthWatch();
    const openCalls = sendTelegramMessage.mock.calls.filter((c) =>
      String(c[0]).includes('Circuit breaker openai is open'),
    );
    expect(openCalls).toHaveLength(1);

    // Second poll: still open → no new alert
    sendTelegramMessage.mockClear();
    await runHealthWatch();
    expect(
      sendTelegramMessage.mock.calls.filter((c) =>
        String(c[0]).includes('Circuit breaker openai is open'),
      ),
    ).toHaveLength(0);

    // Third poll: closed → recovery alert
    sendTelegramMessage.mockClear();
    getCircuitBreakerStatusShared.mockResolvedValue({
      openai: { state: 'closed', failures: 0 },
    });
    await runHealthWatch();
    expect(
      sendTelegramMessage.mock.calls.filter((c) => String(c[0]).includes('recovered')),
    ).toHaveLength(1);
  });

  it('does not alert when muted', async () => {
    setMute(10);
    getCircuitBreakerStatusShared.mockResolvedValue({
      stripe: { state: 'open', failures: 9 },
    });
    await runHealthWatch();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
