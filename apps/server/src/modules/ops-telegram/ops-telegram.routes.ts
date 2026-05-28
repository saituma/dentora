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
  startLiveSession,
  stopLiveSession,
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
  '<b>Calls</b>\n' +
  '  /calls — Call stats for last 24h\n\n' +
  '<b>Logs</b>\n' +
  '  /logs — Last 8 error/fatal log lines\n' +
  '  /live — Tail logs live for 60s\n' +
  '  /stop — Stop live log stream\n\n' +
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
  const lower = rawText.toLowerCase().replace(/@\S+$/, '').trim();

  try {
    switch (lower) {
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
        await sendTelegramMessage(buildBreakersReport());
        break;
      case '/logs':
        await sendTelegramMessage(buildLogsReport());
        break;
      case '/calls':
        await sendTelegramMessage(await buildCallsReport());
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
      case '/help':
        await sendTelegramMessage(HELP_TEXT);
        break;
      default:
        await sendTelegramMessage(
          `Unknown command: <code>${rawText.slice(0, 50)}</code>\n\n${HELP_TEXT}`,
        );
    }
  } catch {
    await sendTelegramMessage('⚠️ Command failed — check /logs').catch(() => undefined);
  }
});
