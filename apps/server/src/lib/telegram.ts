import { env } from '../config/env.js';
import { logger } from './logger.js';

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ALERT_CHAT_ID);
}

// Point Telegram at our webhook so commands are delivered. Safe to call on every
// boot — setWebhook is idempotent. No-ops without a token, a webhook secret, or a
// public base URL (localhost can't receive Telegram callbacks).
export async function registerTelegramWebhook(): Promise<void> {
  if (!isTelegramConfigured() || !env.TELEGRAM_WEBHOOK_SECRET) return;
  const base = env.TWILIO_WEBHOOK_BASE_URL.replace(/\/+$/, '');
  if (!/^https:\/\//.test(base) || base.includes('localhost')) {
    logger.warn({ base }, 'Skipping Telegram webhook registration — base URL not public HTTPS');
    return;
  }

  const url = `${base}/api/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, allowed_updates: ['message'] }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && body.ok) {
      logger.info({ url }, 'Telegram webhook registered');
    } else {
      logger.warn({ status: res.status, description: body.description }, 'setWebhook failed');
    }
  } catch (err) {
    logger.warn({ err }, 'Telegram setWebhook network error');
  }
}

// Telegram hard limit is 4096 chars; leave headroom for the truncation marker.
const TELEGRAM_MAX_LEN = 4000;

function htmlToPlain(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function postMessage(text: string, parseMode: 'HTML' | undefined): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_ALERT_CHAT_ID,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      disable_web_page_preview: true,
    }),
  });
}

export async function sendTelegramMessage(text: string): Promise<void> {
  if (!isTelegramConfigured()) return;

  const trimmed =
    text.length > TELEGRAM_MAX_LEN ? `${text.slice(0, TELEGRAM_MAX_LEN)}\n…(truncated)` : text;

  try {
    const res = await postMessage(trimmed, 'HTML');
    if (res.ok) return;

    const body = await res.text().catch(() => '');
    logger.warn({ status: res.status, body: body.slice(0, 200) }, 'Telegram sendMessage failed');

    // A 400 almost always means malformed HTML entities. Retry once as plain
    // text so the alert is never silently lost.
    if (res.status === 400) {
      const fallback = await postMessage(htmlToPlain(trimmed), undefined);
      if (!fallback.ok) {
        const fbBody = await fallback.text().catch(() => '');
        logger.warn(
          { status: fallback.status, body: fbBody.slice(0, 200) },
          'Telegram plain-text fallback failed',
        );
      }
    }
  } catch (err) {
    // Swallow — alerting must never crash the caller or loop via logEmitter
    logger.warn({ err }, 'Telegram sendMessage network error');
  }
}
