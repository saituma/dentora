import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { sendTelegramMessage, isTelegramConfigured } from '../../lib/telegram.js';
import { buildStatusReport } from './ops-telegram.service.js';

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
  const lower = text.toLowerCase();

  if (lower === '/status' || lower === '/health') {
    const report = await buildStatusReport().catch(() => '⚠️ Failed to build status report');
    await sendTelegramMessage(report);
    return;
  }

  if (lower === '/help') {
    await sendTelegramMessage(
      '<b>Dentora Ops Bot</b>\n\n' +
        '/status — Live health report (DB, Redis, AI, circuit breakers)\n' +
        '/health — Same as /status\n' +
        '/help — Show this message',
    );
    return;
  }

  await sendTelegramMessage(`Unknown command: <code>${text.slice(0, 50)}</code>\nTry /help`);
});
