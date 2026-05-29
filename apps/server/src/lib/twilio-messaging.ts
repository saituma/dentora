/**
 * Outbound SMS / WhatsApp sender, used for appointment reminders.
 *
 * Safety:
 *  - When env.TWILIO_DRY_RUN is true, messages are logged and NOT sent. Use this in any
 *    environment whose .env points at the live Twilio account but isn't truly production.
 *  - Phone numbers are masked in logs (never log full PII).
 *
 * This is intentionally separate from telephony.service.ts (voice) so reminder code does not
 * pull in the call-handling surface.
 */
import twilio from 'twilio';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { twilioNumbers } from '../db/schema.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export type MessageChannel = 'sms' | 'whatsapp';

export type SendMessageResult =
  | { sent: true; dryRun: boolean; messageSid?: string }
  | { sent: false; reason: string };

let cachedClient: ReturnType<typeof twilio> | null = null;

function getClient(): ReturnType<typeof twilio> {
  if (!cachedClient) {
    cachedClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return cachedClient;
}

/** Masks a phone number for logging: +447700900123 -> +4477****0123 */
function maskPhone(value: string): string {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 5)}****${value.slice(-4)}`;
}

/** Resolves the tenant's active SMS-capable Twilio number, or null. */
async function resolveSmsFromNumber(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.tenantId, tenantId), eq(twilioNumbers.status, 'active')))
    .limit(1);
  if (!row) return null;
  const capabilities = row.capabilities as Record<string, boolean> | null;
  if (!capabilities?.sms) return null;
  return row.phoneNumber;
}

/**
 * Sends a message on the given channel. Returns a discriminated result rather than throwing,
 * so callers can record the outcome per reminder.
 */
export async function sendPatientMessage(input: {
  tenantId: string;
  channel: MessageChannel;
  /** Recipient phone in E.164, without any `whatsapp:` prefix. */
  to: string;
  body: string;
}): Promise<SendMessageResult> {
  const { tenantId, channel, to, body } = input;

  let from: string | null;
  if (channel === 'whatsapp') {
    from = env.TWILIO_WHATSAPP_FROM || null;
  } else {
    from = await resolveSmsFromNumber(tenantId);
  }

  if (!from) {
    const reason =
      channel === 'whatsapp' ? 'no_whatsapp_sender_configured' : 'no_active_sms_capable_number';
    logger.info({ tenantId, channel }, `Reminder skipped — ${reason}`);
    return { sent: false, reason };
  }

  if (env.TWILIO_DRY_RUN) {
    logger.warn(
      { tenantId, channel, to: maskPhone(to), bodyLength: body.length },
      'TWILIO_DRY_RUN active — message not actually sent',
    );
    return { sent: true, dryRun: true };
  }

  try {
    const to_ = channel === 'whatsapp' ? `whatsapp:${to}` : to;
    // A Messaging Service (SMS only) overrides the from-number with a managed sender pool.
    const message =
      channel === 'sms' && env.TWILIO_MESSAGING_SERVICE_SID
        ? await getClient().messages.create({
            to: to_,
            body,
            messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
          })
        : await getClient().messages.create({
            to: to_,
            body,
            from: channel === 'whatsapp' ? `whatsapp:${from}` : from,
          });
    logger.info(
      { tenantId, channel, to: maskPhone(to), messageSid: message.sid },
      'Reminder message sent',
    );
    return { sent: true, dryRun: false, messageSid: message.sid };
  } catch (error) {
    logger.error({ err: error, tenantId, channel }, 'Failed to send reminder message');
    return { sent: false, reason: error instanceof Error ? error.message : 'send_failed' };
  }
}
