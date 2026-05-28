import { checkDbHealth } from '../../db/index.js';
import { getRedis } from '../../lib/cache.js';
import { getCircuitBreakerStatus } from '../../lib/circuit-breaker.js';
import { sendTelegramMessage, isTelegramConfigured } from '../../lib/telegram.js';
import { logEmitter, type LogEntry } from '../admin/admin-log-stream.js';
import {
  getOperationalHealthSnapshot,
  APPOINTMENT_MAINTENANCE_COMPONENT,
} from '../operational-health/operational-health.service.js';
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
