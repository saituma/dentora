import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { sendTelegramMessage, isTelegramConfigured } from '../../lib/telegram.js';
import {
  buildStatusReport,
  buildQuickStatus,
  buildBreakersReport,
  buildLogsReport,
  buildAiReport,
  buildCallsReport,
  buildQueuesReport,
  buildCostReport,
  buildTenantsReport,
  buildVersionReport,
  startLiveSession,
  stopLiveSession,
  setMute,
  clearMute,
  escapeHtml,
} from './ops-telegram.service.js';

export const opsTelegramRouter = Router();

function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const SEP = '─'.repeat(28);
const HELP_TEXT =
  `🤖 <b>Dentora Ops Bot — Commands</b>\n${SEP}\n\n` +
  '<b>System</b>\n' +
  '  /status — Quick summary + uptime\n' +
  '  /health — Full health report\n\n' +
  '<b>Infrastructure</b>\n' +
  '  /ai — AI provider success rates &amp; latency\n' +
  '  /breakers — Circuit breaker states\n' +
  '  /queues — BullMQ queue depths\n\n' +
  '<b>Calls &amp; Business</b>\n' +
  '  /calls — Call stats for last 24h\n' +
  '  /cost — Spend today + 7-day trend\n' +
  '  /tenants — Busiest clinics (24h)\n\n' +
  '<b>Logs</b>\n' +
  '  /logs — Last 8 error/fatal log lines\n' +
  '  /live — Tail logs live for 60s\n' +
  '  /stop — Stop live log stream\n\n' +
  '<b>Bot</b>\n' +
  '  /version — Current release &amp; uptime\n' +
  '  /mute &lt;min&gt; — Silence auto-alerts for N minutes\n' +
  '  /unmute — Re-enable auto-alerts\n' +
  '  /help — Show this message';

opsTelegramRouter.post('/webhook/:secret', async (req: Request, res: Response) => {
  if (!isTelegramConfigured()) {
    res.sendStatus(204);
    return;
  }

  const reqSecret = Array.isArray(req.params.secret) ? req.params.secret[0] : req.params.secret;
  if (!secretsMatch(reqSecret ?? '', env.TELEGRAM_WEBHOOK_SECRET)) {
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);

  const body = req.body as Record<string, unknown>;
  const message = body?.message as Record<string, unknown> | undefined;
  if (!message) return;

  const chatId = String((message.chat as Record<string, unknown> | undefined)?.id ?? '');
  if (chatId !== env.TELEGRAM_ALERT_CHAT_ID) return;

  const rawText = String((message.text as string | undefined) ?? '').trim();
  const [cmdRaw = '', argRaw = ''] = rawText.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\S+$/, '');

  try {
    switch (cmd) {
      case '/status':
        await sendTelegramMessage(await buildQuickStatus());
        break;
      case '/health':
        await sendTelegramMessage(await buildStatusReport());
        break;
      case '/ai':
        await sendTelegramMessage(await buildAiReport());
        break;
      case '/breakers':
        await sendTelegramMessage(await buildBreakersReport());
        break;
      case '/logs':
        await sendTelegramMessage(buildLogsReport());
        break;
      case '/calls':
        await sendTelegramMessage(await buildCallsReport());
        break;
      case '/cost':
        await sendTelegramMessage(await buildCostReport());
        break;
      case '/tenants':
        await sendTelegramMessage(await buildTenantsReport());
        break;
      case '/queues':
        await sendTelegramMessage(await buildQueuesReport());
        break;
      case '/live':
        if (startLiveSession(chatId) === 'already_running') {
          await sendTelegramMessage('📺 Live log already running. Send /stop to end it.');
        } else {
          await sendTelegramMessage(
            '📺 <b>Live log started</b> — streaming all logs for 60s.\nSend /stop to end early.',
          );
        }
        break;
      case '/stop':
        if (stopLiveSession(chatId)) {
          await sendTelegramMessage('📺 <b>Live log stopped.</b>');
        } else {
          await sendTelegramMessage('No live session running. Send /live to start one.');
        }
        break;
      case '/version':
        await sendTelegramMessage(buildVersionReport());
        break;
      case '/mute': {
        const minutes = Math.min(Math.max(Math.round(Number(argRaw) || 30), 1), 1440);
        const until = setMute(minutes);
        await sendTelegramMessage(
          `🔕 <b>Auto-alerts muted for ${minutes}m</b> (until ${new Date(until).toUTCString()}).\nCommands still work. Send /unmute to re-enable.`,
        );
        break;
      }
      case '/unmute':
        clearMute();
        await sendTelegramMessage('🔔 <b>Auto-alerts re-enabled.</b>');
        break;
      case '/help':
        await sendTelegramMessage(HELP_TEXT);
        break;
      default:
        await sendTelegramMessage(
          `Unknown command: <code>${escapeHtml(rawText.slice(0, 50))}</code>\n\n${HELP_TEXT}`,
        );
    }
  } catch {
    await sendTelegramMessage('⚠️ Command failed — check /logs').catch(() => undefined);
  }
});
