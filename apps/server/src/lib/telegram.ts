import { env } from '../config/env.js';
import { logger } from './logger.js';

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ALERT_CHAT_ID);
}

export async function sendTelegramMessage(text: string): Promise<void> {
  if (!isTelegramConfigured()) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_ALERT_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: body.slice(0, 200) }, 'Telegram sendMessage failed');
    }
  } catch (err) {
    // Swallow — alerting must never crash the caller or loop via logEmitter
    logger.warn({ err }, 'Telegram sendMessage network error');
  }
}
