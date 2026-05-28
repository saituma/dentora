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

const HELP_TEXT =
  '<b>Dentora Ops Bot — Commands</b>\n\n' +
  '/status — Quick one-line summary\n' +
  '/health — Full health report (DB, Redis, workers, breakers)\n' +
  '/ai — AI provider success rates &amp; latency\n' +
  '/breakers — Circuit breaker states\n' +
  '/logs — Last 5 error &amp; fatal log lines\n' +
  '/help — Show this message';

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

  // Acknowledge immediately — Telegram retries if we take too long
  res.sendStatus(200);

  const body = req.body as Record<string, unknown>;
  const message = body?.message as Record<string, unknown> | undefined;
  if (!message) return;

  const chatId = (message.chat as Record<string, unknown> | undefined)?.id;
  if (String(chatId) !== env.TELEGRAM_ALERT_CHAT_ID) return;

  const text = String((message.text as string | undefined) ?? '').trim();
  // Strip bot username suffix if present (e.g. /status@dentroabot)
  const lower = text.toLowerCase().replace(/@\S+$/, '').trim();

  try {
    if (lower === '/status') {
      await sendTelegramMessage(await buildQuickStatus());
    } else if (lower === '/health') {
      await sendTelegramMessage(await buildStatusReport());
    } else if (lower === '/ai') {
      await sendTelegramMessage(await buildAiReport());
    } else if (lower === '/breakers') {
      await sendTelegramMessage(buildBreakersReport());
    } else if (lower === '/logs') {
      await sendTelegramMessage(buildLogsReport());
    } else if (lower === '/help') {
      await sendTelegramMessage(HELP_TEXT);
    } else {
      await sendTelegramMessage(
        `Unknown command: <code>${text.slice(0, 50)}</code>\n\n${HELP_TEXT}`,
      );
    }
  } catch {
    await sendTelegramMessage('⚠️ Command failed — check server logs').catch(() => undefined);
  }
});
