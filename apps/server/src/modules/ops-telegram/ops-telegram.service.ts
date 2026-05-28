import { checkDbHealth } from '../../db/index.js';
import { getRedis } from '../../lib/cache.js';
import { getCircuitBreakerStatus } from '../../lib/circuit-breaker.js';
import { sendTelegramMessage, isTelegramConfigured } from '../../lib/telegram.js';
import { logEmitter, getRecentLogs, type LogEntry } from '../admin/admin-log-stream.js';
import {
  getOperationalHealthSnapshot,
  APPOINTMENT_MAINTENANCE_COMPONENT,
} from '../operational-health/operational-health.service.js';
import { env } from '../../config/env.js';

interface ProviderHealthSnapshot {
  avgLatencyMs: number;
  successRate: number;
  sampleCount: number;
  lastErrorAt?: string;
  lastError?: string;
}

export type AlertCategory = 'ERROR' | 'AI' | 'TELEPHONY' | 'JOB' | 'HEALTH' | 'LIFECYCLE';

const CATEGORY_EMOJI: Record<AlertCategory, string> = {
  ERROR: '🔴',
  AI: '🤖',
  TELEPHONY: '📞',
  JOB: '📦',
  HEALTH: '💚',
  LIFECYCLE: '🚀',
};

const HEALTH_EMOJI: Record<string, string> = {
  healthy: '💚',
  degraded: '💛',
  unhealthy: '❤️',
  unknown: '⬜',
};

// In-memory dedupe: category+title → last-sent timestamp
const _dedupeMap = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

// Rate-limit: track messages sent per minute
let _rateWindowStart = Date.now();
let _rateCount = 0;
const MAX_PER_MINUTE = 20;

function shouldSend(category: AlertCategory, title: string): boolean {
  const key = `${category}:${title}`;
  const now = Date.now();

  const last = _dedupeMap.get(key) ?? 0;
  if (now - last < DEDUPE_WINDOW_MS) return false;

  if (now - _rateWindowStart > 60_000) {
    _rateWindowStart = now;
    _rateCount = 0;
  }
  if (_rateCount >= MAX_PER_MINUTE) return false;

  _dedupeMap.set(key, now);
  _rateCount += 1;
  return true;
}

export async function notifyOps(opts: {
  category: AlertCategory;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  if (!shouldSend(opts.category, opts.title)) return;

  const emoji = CATEGORY_EMOJI[opts.category];
  const envTag = env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV;
  let text = `${emoji} <b>[${opts.category}]</b> <i>${envTag}</i>\n${opts.title}`;
  if (opts.detail) text += `\n<code>${opts.detail.slice(0, 300)}</code>`;
  if (opts.meta) {
    const pairs = Object.entries(opts.meta)
      .slice(0, 5)
      .map(([k, v]) => `  ${k}: ${String(v).slice(0, 80)}`)
      .join('\n');
    if (pairs) text += `\n${pairs}`;
  }

  await sendTelegramMessage(text);
}

function classifyLogEntry(entry: LogEntry): AlertCategory {
  const msg = String(entry.msg ?? '').toLowerCase();
  if (
    msg.includes('circuit breaker') ||
    msg.includes('all providers failed') ||
    msg.includes('provider failed') ||
    msg.includes('llm') ||
    msg.includes('stt') ||
    msg.includes('tts')
  ) {
    return 'AI';
  }
  if (
    msg.includes('webhook') ||
    msg.includes('media stream') ||
    msg.includes('twilio') ||
    msg.includes('telephony') ||
    msg.includes('call')
  ) {
    return 'TELEPHONY';
  }
  if (
    msg.includes('dead-letter') ||
    msg.includes('job failed') ||
    msg.includes('dlq') ||
    msg.includes('manual intervention')
  ) {
    return 'JOB';
  }
  return 'ERROR';
}

export function initTelegramDispatcher(): void {
  if (!isTelegramConfigured()) return;

  logEmitter.on('log', (entry: LogEntry) => {
    if (entry.level < 50) return; // error=50, fatal=60

    const category = classifyLogEntry(entry);
    const title = String(entry.msg ?? 'Unknown error').slice(0, 200);
    const meta: Record<string, unknown> = {};
    if (entry.correlationId) meta.correlationId = entry.correlationId;
    if (entry.path) meta.path = entry.path;
    if (entry.tenantId) meta.tenantId = entry.tenantId;
    if (entry.service) meta.service = entry.service;

    notifyOps({ category, title, meta }).catch(() => undefined);
  });
}

export async function buildStatusReport(): Promise<string> {
  const [dbOk, redisOk, opHealth, breakers] = await Promise.all([
    checkDbHealth().catch(() => false),
    getRedis()
      .ping()
      .then(() => true)
      .catch(() => false),
    getOperationalHealthSnapshot({ component: APPOINTMENT_MAINTENANCE_COMPONENT }).catch(
      () => null,
    ),
    Promise.resolve(getCircuitBreakerStatus()),
  ]);

  const dbIcon = dbOk ? '✅' : '❌';
  const redisIcon = redisOk ? '✅' : '❌';

  const overallOk = dbOk && redisOk;
  const breakerEntries = Object.entries(breakers);
  const openBreakers = breakerEntries.filter(([, b]) => b.state !== 'closed');

  let report = `<b>Dentora Status Report</b>\n`;
  report += `<i>${new Date().toUTCString()}</i>\n\n`;
  report += `${dbIcon} Database\n`;
  report += `${redisIcon} Redis\n`;

  if (opHealth) {
    const statusEmoji = HEALTH_EMOJI[opHealth.status] ?? '⬜';
    report += `${statusEmoji} Appointment maintenance: ${opHealth.status}`;
    if (!opHealth.fresh) report += ` (stale)`;
    report += '\n';
  }

  if (breakerEntries.length === 0) {
    report += `✅ All circuit breakers closed\n`;
  } else if (openBreakers.length === 0) {
    report += `✅ All ${breakerEntries.length} circuit breakers closed\n`;
  } else {
    report += `⚠️ Open circuit breakers:\n`;
    for (const [name, b] of openBreakers) {
      report += `  • ${name}: ${b.state} (${b.failures} failures)\n`;
    }
  }

  report += `\n${overallOk && openBreakers.length === 0 ? '💚 All systems nominal' : '⚠️ Issues detected — check logs'}`;
  return report;
}

/** One-line ping summary — used as the quick /status response. */
export async function buildQuickStatus(): Promise<string> {
  const [dbOk, redisOk, breakers] = await Promise.all([
    checkDbHealth().catch(() => false),
    getRedis()
      .ping()
      .then(() => true)
      .catch(() => false),
    Promise.resolve(getCircuitBreakerStatus()),
  ]);

  const openBreakers = Object.entries(breakers).filter(([, b]) => b.state !== 'closed');
  const allOk = dbOk && redisOk && openBreakers.length === 0;
  const icon = allOk ? '💚' : '⚠️';
  const envTag = env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV;

  let msg = `${icon} <b>Dentora</b> <i>${envTag}</i> — ${allOk ? 'all systems nominal' : 'issues detected'}\n`;
  msg += `${dbOk ? '✅' : '❌'} DB  ${redisOk ? '✅' : '❌'} Redis`;
  if (openBreakers.length > 0) {
    msg += `\n⚡ ${openBreakers.length} circuit breaker(s) open: ${openBreakers.map(([n]) => n).join(', ')}`;
  }
  msg += `\n<i>Use /health for full report</i>`;
  return msg;
}

/** Detailed circuit breaker report. */
export function buildBreakersReport(): string {
  const breakers = getCircuitBreakerStatus();
  const entries = Object.entries(breakers);

  if (entries.length === 0) {
    return '⚡ <b>Circuit Breakers</b>\nNo breakers recorded yet — all services healthy.';
  }

  let msg = `⚡ <b>Circuit Breakers</b> (${entries.length} tracked)\n\n`;
  for (const [name, b] of entries) {
    const icon = b.state === 'closed' ? '✅' : b.state === 'open' ? '🔴' : '💛';
    msg += `${icon} <code>${name}</code>: ${b.state}`;
    if (b.failures > 0) msg += ` — ${b.failures} failure(s)`;
    msg += '\n';
  }
  return msg.trimEnd();
}

/** Last N error/fatal log lines from the in-memory ring buffer. */
export function buildLogsReport(n = 5): string {
  const errors = getRecentLogs()
    .filter((e) => e.level >= 50)
    .slice(-n);

  if (errors.length === 0) {
    return '📋 <b>Recent Errors</b>\nNo errors in the last 100 log lines. 💚';
  }

  let msg = `📋 <b>Recent Errors</b> (last ${errors.length})\n\n`;
  for (const e of errors) {
    const level = e.level >= 60 ? 'FATAL' : 'ERROR';
    const time = new Date(Number(e.time)).toISOString().replace('T', ' ').slice(0, 19);
    msg += `<b>${level}</b> <i>${time}</i>\n<code>${String(e.msg ?? '').slice(0, 120)}</code>\n\n`;
  }
  return msg.trimEnd();
}

/** AI provider EWMA health scores from Redis. */
export async function buildAiReport(): Promise<string> {
  const redis = getRedis();
  const keys = await redis.keys('global:provider-health:*').catch(() => null);
  if (keys === null) {
    return '🤖 <b>AI Providers</b>\nCould not read provider health from Redis.';
  }

  if (keys.length === 0) {
    return '🤖 <b>AI Providers</b>\nNo provider health data yet — no calls made since last deploy.';
  }

  const entries: Array<{ name: string; data: ProviderHealthSnapshot }> = [];
  for (const key of keys.sort()) {
    const name = key.replace('global:provider-health:', '');
    try {
      const raw = await redis.get(key);
      if (raw) entries.push({ name, data: JSON.parse(raw) as ProviderHealthSnapshot });
    } catch {
      /* skip */
    }
  }

  const breakers = getCircuitBreakerStatus();
  let msg = `🤖 <b>AI Providers</b>\n\n`;
  for (const { name, data } of entries) {
    const rate = Math.round(data.successRate * 100);
    const latency = Math.round(data.avgLatencyMs);
    const icon = rate >= 90 ? '✅' : rate >= 70 ? '💛' : '🔴';
    const breakerState = breakers[name]?.state ?? 'closed';
    const breakerTag = breakerState !== 'closed' ? ` ⚡${breakerState}` : '';
    msg += `${icon} <code>${name}</code>${breakerTag}\n`;
    msg += `   ${rate}% success · ${latency}ms avg · ${data.sampleCount} samples\n`;
    if (data.lastError) {
      msg += `   Last error: <i>${data.lastError.slice(0, 80)}</i>\n`;
    }
    msg += '\n';
  }
  return msg.trimEnd();
}
