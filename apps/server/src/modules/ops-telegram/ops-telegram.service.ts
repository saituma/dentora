import { and, count, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { callSessions } from '../../db/schema.js';
import { checkDbHealth } from '../../db/index.js';
import { getRedis } from '../../lib/cache.js';
import { getCircuitBreakerStatusShared } from '../../lib/circuit-breaker.js';
import { sendTelegramMessage, isTelegramConfigured } from '../../lib/telegram.js';
import { logEmitter, getRecentLogs, type LogEntry } from '../admin/admin-log-stream.js';
import {
  getOperationalHealthSnapshot,
  APPOINTMENT_MAINTENANCE_COMPONENT,
  countRecentMediaStreamEventsByType,
} from '../operational-health/operational-health.service.js';
import { getQueue, QUEUE_NAMES } from '../../lib/queue.js';
import {
  getOpsDailyCost,
  getOpsCostByProvider,
  getOpsTopTenants,
} from '../analytics/analytics.service.js';
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

// ── Mute (silences auto-alerts only; manual commands always respond) ──────────
let _mutedUntil = 0;

export function setMute(minutes: number): number {
  _mutedUntil = Date.now() + minutes * 60_000;
  return _mutedUntil;
}

export function clearMute(): void {
  _mutedUntil = 0;
}

export function isMuted(): boolean {
  return Date.now() < _mutedUntil;
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
      const time = safeTime(entry.time).slice(11, 19);
      const msg = escapeHtml(String(entry.msg ?? '').slice(0, 100));
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
  if (isMuted()) return;
  if (!shouldSend(opts.category, opts.title)) return;

  const emoji = CATEGORY_EMOJI[opts.category];
  const envTag = env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV;
  const sep = '─'.repeat(28);
  let text = `${emoji} <b>[${opts.category}]</b>  <i>${envTag}</i>\n${sep}\n${escapeHtml(opts.title)}`;
  if (opts.detail) text += `\n\n<code>${escapeHtml(opts.detail.slice(0, 300))}</code>`;
  if (opts.meta) {
    const pairs = Object.entries(opts.meta)
      .filter(([, v]) => v !== undefined && v !== '')
      .slice(0, 6)
      .map(([k, v]) => `▸ ${escapeHtml(k)}: <code>${escapeHtml(String(v).slice(0, 80))}</code>`)
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
    if (entry.queue) meta.queue = entry.queue;
    if (entry.originalQueue) meta.queue = entry.originalQueue;
    notifyOps({ category, title, meta }).catch(() => undefined);
  });
}

// ── Proactive health watch (edge-triggered) ──────────────────────────────────
// Tracks last-known good/bad per subject so we alert once on degradation and
// once on recovery — never every poll. Runs on the worker dyno.
const _watchState = new Map<string, 'ok' | 'bad'>();
const FAILED_JOBS_THRESHOLD = 10;
const PROVIDER_MIN_SAMPLES = 20;
const PROVIDER_MIN_SUCCESS = 0.5;
// Mid-call ConvAI drops don't trip the elevenlabs breaker (they're WS drops, not
// fetch failures), and per-event log alerts dedup by title — so a wave of dropped
// patients can otherwise go unnoticed. Edge-alert on a spike instead.
const CALL_DROP_WINDOW_MS = 10 * 60_000;
const CALL_DROP_SPIKE_THRESHOLD = 3;

function edge(key: string, isBad: boolean, badTitle: string, goodTitle: string): void {
  const prev = _watchState.get(key);
  const cur = isBad ? 'bad' : 'ok';
  if (cur === prev) return;
  _watchState.set(key, cur);
  if (cur === 'bad') {
    notifyOps({ category: 'HEALTH', title: badTitle }).catch(() => undefined);
  } else if (prev === 'bad') {
    notifyOps({ category: 'HEALTH', title: goodTitle }).catch(() => undefined);
  }
}

export async function runHealthWatch(): Promise<void> {
  if (!isTelegramConfigured()) return;

  // Circuit breakers
  try {
    const breakers = await getCircuitBreakerStatusShared();
    for (const [name, b] of Object.entries(breakers)) {
      edge(
        `breaker:${name}`,
        b.state !== 'closed',
        `⚡ Circuit breaker ${name} is ${b.state} (${b.failures} failures)`,
        `✅ Circuit breaker ${name} recovered (closed)`,
      );
    }
  } catch {
    /* skip */
  }

  // Dead-letter queue backlog + per-queue failed jobs
  try {
    for (const name of Object.values(QUEUE_NAMES)) {
      const q = getQueue(name as Parameters<typeof getQueue>[0]);
      const counts = await q.getJobCounts('waiting', 'failed');
      if (name === QUEUE_NAMES.DEAD_LETTER) {
        const waiting = counts.waiting ?? 0;
        edge(
          'dlq',
          waiting > 0,
          `🪦 Dead-letter queue has ${waiting} job(s) needing manual intervention`,
          `✅ Dead-letter queue drained`,
        );
      }
      const failed = counts.failed ?? 0;
      edge(
        `failed:${name}`,
        failed > FAILED_JOBS_THRESHOLD,
        `📦 Queue ${name} has ${failed} failed jobs`,
        `✅ Queue ${name} failed-job backlog cleared`,
      );
    }
  } catch {
    /* skip */
  }

  // AI provider degradation (global Redis snapshots)
  try {
    const redis = getRedis();
    const keys = await redis.keys('global:provider-health:*');
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const d = JSON.parse(raw) as ProviderHealthSnapshot;
      const name = key.replace('global:provider-health:', '');
      const degraded =
        d.sampleCount >= PROVIDER_MIN_SAMPLES && d.successRate < PROVIDER_MIN_SUCCESS;
      edge(
        `provider:${name}`,
        degraded,
        `🤖 Provider ${name} degraded — ${pct(d.successRate)} success over ${d.sampleCount} calls`,
        `✅ Provider ${name} recovered`,
      );
    }
  } catch {
    /* skip */
  }

  // Infra
  try {
    const dbOk = await checkDbHealth().catch(() => false);
    edge('db', !dbOk, `🔴 Database health check failing`, `✅ Database recovered`);
    const redisOk = await getRedis()
      .ping()
      .then(() => true)
      .catch(() => false);
    edge('redis', !redisOk, `🔴 Redis not responding to ping`, `✅ Redis recovered`);
  } catch {
    /* skip */
  }

  // Mid-call AI drop spike — patients being dropped mid-conversation.
  try {
    const drops = await countRecentMediaStreamEventsByType({
      eventType: 'abnormal_disconnect',
      since: new Date(Date.now() - CALL_DROP_WINDOW_MS),
    });
    edge(
      'call_drops',
      drops >= CALL_DROP_SPIKE_THRESHOLD,
      `📞 ${drops} AI calls dropped mid-conversation in the last ${Math.round(
        CALL_DROP_WINDOW_MS / 60_000,
      )}m — patients are being affected`,
      `✅ AI call-drop spike subsided`,
    );
  } catch {
    /* skip */
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const _startedAt = Date.now();

function safeTime(raw: unknown): string {
  const d = typeof raw === 'number' ? new Date(raw) : new Date(String(raw ?? ''));
  return isNaN(d.getTime()) ? 'unknown' : d.toISOString().replace('T', ' ').slice(0, 19);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Commands ─────────────────────────────────────────────────────────────────

export async function buildQuickStatus(): Promise<string> {
  const [dbOk, redisOk, breakers] = await Promise.all([
    checkDbHealth().catch(() => false),
    getRedis()
      .ping()
      .then(() => true)
      .catch(() => false),
    getCircuitBreakerStatusShared(),
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

export function buildVersionReport(): string {
  const sep = '─'.repeat(28);
  const release =
    process.env.HEROKU_RELEASE_VERSION ??
    process.env.SOURCE_VERSION ??
    process.env.HEROKU_SLUG_COMMIT ??
    'unknown';
  const envTag = env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV;
  let msg = `🏷 <b>Dentora Version</b> · <i>${envTag}</i>\n${sep}\n`;
  msg += `Release: <code>${escapeHtml(String(release).slice(0, 40))}</code>\n`;
  msg += `Node: <code>${escapeHtml(process.version)}</code>\n`;
  msg += `Uptime: ${uptime()} <i>(this dyno)</i>`;
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
    getCircuitBreakerStatusShared(),
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
      r += `  ${icon} <code>${escapeHtml(name)}</code>: ${b.state}`;
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

  const breakers = await getCircuitBreakerStatusShared();
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
      msg += `${icon} <b>${escapeHtml(name)}</b>${bTag}\n`;
      msg += `   ${bar(rate)} ${pct(rate)} · ${ms(d.avgLatencyMs)} avg · ${d.sampleCount} calls\n`;
      if (d.lastError) msg += `   <i>Last err: ${escapeHtml(d.lastError.slice(0, 80))}</i>\n`;
      msg += '\n';
    } catch {
      /* skip */
    }
  }
  return msg.trimEnd();
}

export async function buildBreakersReport(): Promise<string> {
  const breakers = Object.entries(await getCircuitBreakerStatusShared());
  const sep = '─'.repeat(28);
  let msg = `⚡ <b>Circuit Breakers</b>\n${sep}\n`;

  if (breakers.length === 0) return msg + 'No breakers recorded yet.';

  const open = breakers.filter(([, b]) => b.state !== 'closed');
  const closed = breakers.filter(([, b]) => b.state === 'closed');

  if (open.length > 0) {
    msg += `<b>⚠️ Open / Half-open</b>\n`;
    for (const [name, b] of open) {
      const icon = b.state === 'open' ? '🔴' : '💛';
      msg += `  ${icon} <code>${escapeHtml(name)}</code>: <b>${b.state}</b> — ${b.failures} failures\n`;
    }
    msg += '\n';
  }

  msg += `<b>✅ Closed</b> (${closed.length})\n`;
  for (const [name, b] of closed) {
    msg += `  ✅ <code>${escapeHtml(name)}</code>`;
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
    const time = safeTime(e.time);
    msg += `${level} <i>${time}</i>\n<code>${escapeHtml(String(e.msg ?? '').slice(0, 150))}</code>\n`;
    if (e.path) msg += `<i>path: ${escapeHtml(String(e.path))}</i>\n`;
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
        .where(sql`${callSessions.status} IN ('started', 'in_progress')`),
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
    msg += `⚠️ Could not query call data: ${escapeHtml(err instanceof Error ? err.message : String(err))}`;
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

export async function buildCostReport(): Promise<string> {
  const sep = '─'.repeat(28);
  let msg = `💰 <b>Cost — All Tenants</b>\n${sep}\n`;

  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [daily, byProvider] = await Promise.all([
      getOpsDailyCost(7),
      getOpsCostByProvider(startOfToday),
    ]);

    const todayKey = startOfToday.toISOString().slice(0, 10);
    const today = daily.find((d) => d.day === todayKey)?.cost ?? 0;
    msg += `Today: <b>${usd(today)}</b>\n\n`;

    if (daily.length > 0) {
      const max = Math.max(...daily.map((d) => d.cost), 0.01);
      msg += `<b>Last 7 days</b>\n`;
      for (const d of daily) {
        msg += `<code>${d.day.slice(5)} ${bar(d.cost / max)} ${usd(d.cost)}</code>\n`;
      }
      msg += '\n';
    }

    msg += `<b>Today by provider</b>\n`;
    if (byProvider.length === 0) {
      msg += `  No spend yet today.`;
    } else {
      for (const p of byProvider) {
        msg += `  ▸ ${escapeHtml(p.provider)}: <b>${usd(p.cost)}</b>\n`;
      }
      msg = msg.trimEnd();
    }
  } catch (err) {
    msg += `⚠️ Could not query cost data: ${escapeHtml(err instanceof Error ? err.message : String(err))}`;
  }
  return msg;
}

export async function buildTenantsReport(): Promise<string> {
  const sep = '─'.repeat(28);
  let msg = `🏥 <b>Busiest Clinics — Last 24h</b>\n${sep}\n`;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tenants = await getOpsTopTenants(since, 10);
    if (tenants.length === 0) return msg + 'No calls in the last 24h.';

    let rank = 1;
    for (const t of tenants) {
      msg += `${rank}. <b>${escapeHtml(t.clinicName)}</b> — ${t.calls} calls · ${usd(t.cost)}\n`;
      rank += 1;
    }
  } catch (err) {
    msg += `⚠️ Could not query tenant data: ${escapeHtml(err instanceof Error ? err.message : String(err))}`;
  }
  return msg.trimEnd();
}
