import { and, count, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { callSessions } from '../../db/schema.js';
import { checkDbHealth } from '../../db/index.js';
import { getRedis } from '../../lib/cache.js';
import { getCircuitBreakerStatus } from '../../lib/circuit-breaker.js';
import { sendTelegramMessage, isTelegramConfigured } from '../../lib/telegram.js';
import { logEmitter, getRecentLogs, type LogEntry } from '../admin/admin-log-stream.js';
import {
  getOperationalHealthSnapshot,
  APPOINTMENT_MAINTENANCE_COMPONENT,
} from '../operational-health/operational-health.service.js';
import { getQueue, QUEUE_NAMES } from '../../lib/queue.js';
import { env } from '../../config/env.js';

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
  unhealthy: '🔴',
  unknown: '⬜',
};

interface ProviderHealthSnapshot {
  avgLatencyMs: number;
  successRate: number;
  sampleCount: number;
  lastErrorAt?: string;
  lastError?: string;
}

// ── Dedupe + rate-limit ──────────────────────────────────────────────────────
const _dedupeMap = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;
let _rateWindowStart = Date.now();
let _rateCount = 0;
const MAX_PER_MINUTE = 20;

function shouldSend(category: AlertCategory, title: string): boolean {
  const key = `${category}:${title}`;
  const now = Date.now();
  if (now - (_dedupeMap.get(key) ?? 0) < DEDUPE_WINDOW_MS) return false;
  if (now - _rateWindowStart > 60_000) {
    _rateWindowStart = now;
    _rateCount = 0;
  }
  if (_rateCount >= MAX_PER_MINUTE) return false;
  _dedupeMap.set(key, now);
  _rateCount += 1;
  return true;
}

// ── /live sessions ───────────────────────────────────────────────────────────
interface LiveSession {
  buffer: string[];
  flushTimer: ReturnType<typeof setInterval>;
  stopTimer: ReturnType<typeof setTimeout>;
  listener: (entry: LogEntry) => void;
}
const _liveSessions = new Map<string, LiveSession>();
const LIVE_DURATION_MS = 60_000;
const LIVE_FLUSH_MS = 3_000;

export function startLiveSession(chatId: string): string {
  if (_liveSessions.has(chatId)) return 'already_running';

  const session: LiveSession = {
    buffer: [],
    flushTimer: setInterval(() => flushLiveBuffer(chatId), LIVE_FLUSH_MS),
    stopTimer: setTimeout(() => stopLiveSession(chatId, true), LIVE_DURATION_MS),
    listener: (entry: LogEntry) => {
      const level =
        entry.level >= 60
          ? 'FATAL'
          : entry.level >= 50
            ? 'ERROR'
            : entry.level >= 40
              ? 'WARN'
              : 'INFO';
      const time = new Date(Number(entry.time)).toISOString().slice(11, 19);
      const msg = String(entry.msg ?? '').slice(0, 100);
      session.buffer.push(`<code>[${time}] ${level} ${msg}</code>`);
    },
  };

  logEmitter.on('log', session.listener);
  _liveSessions.set(chatId, session);
  return 'started';
}

export function stopLiveSession(chatId: string, auto = false): boolean {
  const session = _liveSessions.get(chatId);
  if (!session) return false;
  clearInterval(session.flushTimer);
  clearTimeout(session.stopTimer);
  logEmitter.removeListener('log', session.listener);
  _liveSessions.delete(chatId);
  if (auto) {
    sendTelegramMessage('📺 <b>Live log ended</b> (60s timeout). Send /live to restart.').catch(
      () => undefined,
    );
  }
  return true;
}

function flushLiveBuffer(chatId: string): void {
  const session = _liveSessions.get(chatId);
  if (!session || session.buffer.length === 0) return;
  const lines = session.buffer.splice(0, 20);
  sendTelegramMessage(`📺 <b>LIVE</b>\n${lines.join('\n')}`).catch(() => undefined);
}

// ── Alerts ───────────────────────────────────────────────────────────────────
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
  const sep = '─'.repeat(28);
  let text = `${emoji} <b>[${opts.category}]</b>  <i>${envTag}</i>\n${sep}\n${opts.title}`;
  if (opts.detail) text += `\n\n<code>${opts.detail.slice(0, 300)}</code>`;
  if (opts.meta) {
    const pairs = Object.entries(opts.meta)
      .filter(([, v]) => v !== undefined && v !== '')
      .slice(0, 6)
      .map(([k, v]) => `▸ ${k}: <code>${String(v).slice(0, 80)}</code>`)
      .join('\n');
    if (pairs) text += `\n\n${pairs}`;
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
  )
    return 'AI';
  if (
    msg.includes('webhook') ||
    msg.includes('media stream') ||
    msg.includes('twilio') ||
    msg.includes('telephony') ||
    msg.includes('call')
  )
    return 'TELEPHONY';
  if (
    msg.includes('dead-letter') ||
    msg.includes('job failed') ||
    msg.includes('dlq') ||
    msg.includes('manual intervention')
  )
    return 'JOB';
  return 'ERROR';
}

export function initTelegramDispatcher(): void {
  if (!isTelegramConfigured()) return;

  logEmitter.on('log', (entry: LogEntry) => {
    if (entry.level < 50) return;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const _startedAt = Date.now();

function uptime(): string {
  const ms = Date.now() - _startedAt;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

function bar(rate: number, width = 8): string {
  const filled = Math.round(rate * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── Commands ─────────────────────────────────────────────────────────────────

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
  const icon = allOk ? '💚' : '🔴';
  const envTag = env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV;
  const sep = '─'.repeat(28);

  let msg = `${icon} <b>Dentora</b> · <i>${envTag}</i> · ⏱ ${uptime()}\n${sep}\n`;
  msg += `${dbOk ? '✅' : '❌'} Database  ${redisOk ? '✅' : '❌'} Redis\n`;
  msg +=
    openBreakers.length === 0
      ? `✅ All circuit breakers nominal\n`
      : `⚡ Open breakers: ${openBreakers.map(([n]) => n).join(', ')}\n`;
  msg += `${sep}\n${allOk ? '💚 All systems nominal' : '⚠️ Issues detected'}\n`;
  msg += `<i>/health for full report · /help for all commands</i>`;
  return msg;
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
  const openBreakers = Object.entries(breakers).filter(([, b]) => b.state !== 'closed');
  const allOk = dbOk && redisOk && openBreakers.length === 0;
  const sep = '─'.repeat(28);
  const envTag = env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV;

  let r = `📊 <b>Full Health Report</b> · <i>${envTag}</i>\n`;
  r += `<i>${new Date().toUTCString()}</i>\n`;
  r += `<i>Uptime: ${uptime()}</i>\n${sep}\n`;

  r += `<b>Infrastructure</b>\n`;
  r += `  ${dbOk ? '✅' : '❌'} Database\n`;
  r += `  ${redisOk ? '✅' : '❌'} Redis\n\n`;

  r += `<b>Workers</b>\n`;
  if (opHealth) {
    const e = HEALTH_EMOJI[opHealth.status] ?? '⬜';
    r += `  ${e} Appointment maintenance: <b>${opHealth.status}</b>`;
    if (!opHealth.fresh) r += ` <i>(stale)</i>`;
    if (opHealth.lastSuccessAt)
      r += `\n     Last success: ${new Date(opHealth.lastSuccessAt).toISOString().slice(0, 19).replace('T', ' ')}`;
    r += '\n';
  } else {
    r += `  ⬜ No worker health data\n`;
  }
  r += '\n';

  r += `<b>Circuit Breakers</b> (${Object.keys(breakers).length} tracked)\n`;
  if (Object.keys(breakers).length === 0) {
    r += `  ✅ None triggered yet\n`;
  } else {
    for (const [name, b] of Object.entries(breakers)) {
      const icon = b.state === 'closed' ? '✅' : b.state === 'open' ? '🔴' : '💛';
      r += `  ${icon} <code>${name}</code>: ${b.state}`;
      if (b.failures > 0) r += ` (${b.failures} failures)`;
      r += '\n';
    }
  }

  r += `${sep}\n${allOk && openBreakers.length === 0 ? '💚 All systems nominal' : '⚠️ Issues detected — check /logs'}`;
  return r;
}

export async function buildAiReport(): Promise<string> {
  const redis = getRedis();
  const keys = await redis.keys('global:provider-health:*').catch(() => null);
  if (keys === null) return '🤖 <b>AI Providers</b>\nCould not read from Redis.';

  const sep = '─'.repeat(28);
  let msg = `🤖 <b>AI Provider Health</b>\n${sep}\n`;

  if (keys.length === 0) {
    return msg + 'No data yet — no calls since last deploy.';
  }

  const breakers = getCircuitBreakerStatus();
  for (const key of keys.sort()) {
    const name = key.replace('global:provider-health:', '');
    try {
      const raw = await redis.get(key);
      if (!raw) continue;
      const d = JSON.parse(raw) as ProviderHealthSnapshot;
      const rate = d.successRate;
      const icon = rate >= 0.9 ? '✅' : rate >= 0.7 ? '💛' : '🔴';
      const bState = breakers[name]?.state ?? 'closed';
      const bTag = bState !== 'closed' ? ` ⚡<i>${bState}</i>` : '';
      msg += `${icon} <b>${name}</b>${bTag}\n`;
      msg += `   ${bar(rate)} ${pct(rate)} · ${ms(d.avgLatencyMs)} avg · ${d.sampleCount} calls\n`;
      if (d.lastError) msg += `   <i>Last err: ${d.lastError.slice(0, 80)}</i>\n`;
      msg += '\n';
    } catch {
      /* skip */
    }
  }
  return msg.trimEnd();
}

export function buildBreakersReport(): string {
  const breakers = Object.entries(getCircuitBreakerStatus());
  const sep = '─'.repeat(28);
  let msg = `⚡ <b>Circuit Breakers</b>\n${sep}\n`;

  if (breakers.length === 0) return msg + 'No breakers recorded yet.';

  const open = breakers.filter(([, b]) => b.state !== 'closed');
  const closed = breakers.filter(([, b]) => b.state === 'closed');

  if (open.length > 0) {
    msg += `<b>⚠️ Open / Half-open</b>\n`;
    for (const [name, b] of open) {
      const icon = b.state === 'open' ? '🔴' : '💛';
      msg += `  ${icon} <code>${name}</code>: <b>${b.state}</b> — ${b.failures} failures\n`;
    }
    msg += '\n';
  }

  msg += `<b>✅ Closed</b> (${closed.length})\n`;
  for (const [name, b] of closed) {
    msg += `  ✅ <code>${name}</code>`;
    if (b.failures > 0) msg += ` <i>(${b.failures} recent failures)</i>`;
    msg += '\n';
  }
  return msg.trimEnd();
}

export function buildLogsReport(n = 8): string {
  const errors = getRecentLogs()
    .filter((e) => e.level >= 50)
    .slice(-n);
  const sep = '─'.repeat(28);
  let msg = `📋 <b>Recent Error Logs</b>\n${sep}\n`;

  if (errors.length === 0) return msg + '💚 No errors in the last 100 log lines.';

  for (const e of errors) {
    const level = e.level >= 60 ? '💀 FATAL' : '🔴 ERROR';
    const time = new Date(Number(e.time)).toISOString().replace('T', ' ').slice(0, 19);
    msg += `${level} <i>${time}</i>\n<code>${String(e.msg ?? '').slice(0, 150)}</code>\n`;
    if (e.path) msg += `<i>path: ${String(e.path)}</i>\n`;
    msg += '\n';
  }
  return msg.trimEnd();
}

export async function buildCallsReport(): Promise<string> {
  const sep = '─'.repeat(28);
  let msg = `📞 <b>Call Stats — Last 24h</b>\n${sep}\n`;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, completed, failed, active] = await Promise.all([
      db.select({ n: count() }).from(callSessions).where(gte(callSessions.startedAt, since)),
      db
        .select({ n: count() })
        .from(callSessions)
        .where(and(gte(callSessions.startedAt, since), sql`${callSessions.status} = 'completed'`)),
      db
        .select({ n: count() })
        .from(callSessions)
        .where(and(gte(callSessions.startedAt, since), sql`${callSessions.status} = 'failed'`)),
      db
        .select({ n: count() })
        .from(callSessions)
        .where(sql`${callSessions.status} = 'started'`),
    ]);

    const t = total[0]?.n ?? 0;
    const c = completed[0]?.n ?? 0;
    const f = failed[0]?.n ?? 0;
    const a = active[0]?.n ?? 0;
    const successRate = t > 0 ? c / t : 1;

    msg += `📊 Total: <b>${t}</b>\n`;
    msg += `✅ Completed: <b>${c}</b>\n`;
    msg += `🔴 Failed: <b>${f}</b>\n`;
    msg += `🔵 Active now: <b>${a}</b>\n`;
    msg += `\n${bar(successRate)} ${pct(successRate)} success rate`;
  } catch (err) {
    msg += `⚠️ Could not query call data: ${err instanceof Error ? err.message : String(err)}`;
  }
  return msg;
}

export async function buildQueuesReport(): Promise<string> {
  const sep = '─'.repeat(28);
  let msg = `📦 <b>BullMQ Queue Depths</b>\n${sep}\n`;

  const queueNames = Object.values(QUEUE_NAMES);
  for (const name of queueNames) {
    try {
      const q = getQueue(name as Parameters<typeof getQueue>[0]);
      const counts = await q.getJobCounts('waiting', 'active', 'failed', 'delayed');
      const hasIssue = (counts.failed ?? 0) > 0 || (counts.waiting ?? 0) > 50;
      const icon = hasIssue ? '⚠️' : '✅';
      msg += `${icon} <code>${name}</code>\n`;
      msg += `   ▸ waiting: ${counts.waiting ?? 0}  active: ${counts.active ?? 0}  failed: ${counts.failed ?? 0}  delayed: ${counts.delayed ?? 0}\n`;
    } catch {
      msg += `⬜ <code>${name}</code> — unavailable\n`;
    }
  }
  return msg.trimEnd();
}
