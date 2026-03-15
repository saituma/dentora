
import { db } from '../../db/index.js';
import { twilioNumbers, tenantRegistry, callSessions, tenantActiveConfig } from '../../db/schema.js';
import { eq, and, sql, or } from 'drizzle-orm';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, TelephonyError, PhoneNumberNotMappedError } from '../../lib/errors.js';
import { generateId } from '../../lib/crypto.js';
import * as callService from '../calls/call.service.js';
import type { InferSelectModel } from 'drizzle-orm';
import { tenantConfigVersions } from '../../db/schema.js';
import { env } from '../../config/env.js';
import twilio from 'twilio';

type TwilioNumber = InferSelectModel<typeof twilioNumbers>;
type TwilioIncomingNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName?: string | null;
  capabilities?: Record<string, boolean> | null;
};

export async function getPublicNumberStatus(input: {
  phoneNumber: string;
}): Promise<{
  phoneNumber: string;
  assigned: boolean;
  online: boolean;
  inCall: boolean;
  activeCallCount: number;
}> {
  const [number] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.phoneNumber, input.phoneNumber), eq(twilioNumbers.status, 'active')))
    .limit(1);

  if (!number) {
    return {
      phoneNumber: input.phoneNumber,
      assigned: false,
      online: false,
      inCall: false,
      activeCallCount: 0,
    };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(callSessions)
    .where(and(
      eq(callSessions.twilioNumberId, number.id),
      or(
        eq(callSessions.status, 'started'),
        eq(callSessions.status, 'in_progress'),
      ),
    ));

  const activeCallCount = count ?? 0;

  return {
    phoneNumber: input.phoneNumber,
    assigned: true,
    online: true,
    inCall: activeCallCount > 0,
    activeCallCount,
  };
}

export async function assignPhoneNumber(input: {
  tenantId: string;
  phoneNumber: string;
  twilioSid: string;
  friendlyName?: string;
  capabilities?: Record<string, boolean>;
}): Promise<TwilioNumber> {
  const [existing] = await db
    .select()
    .from(twilioNumbers)
    .where(eq(twilioNumbers.phoneNumber, input.phoneNumber))
    .limit(1);

  if (existing) {
    if (existing.tenantId !== input.tenantId) {
      throw new TelephonyError('Phone number is already assigned to another clinic');
    }

    const [updated] = await db
      .update(twilioNumbers)
      .set({
        twilioSid: input.twilioSid,
        friendlyName: input.friendlyName,
        capabilities: input.capabilities ?? existing.capabilities ?? { voice: true, sms: false },
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(twilioNumbers.id, existing.id))
      .returning();

    await cache.setPhoneMapping(input.phoneNumber, input.tenantId);

    logger.info(
      { tenantId: input.tenantId, phoneNumber: input.phoneNumber },
      'Phone number reassigned to tenant',
    );

    return updated;
  }

  const id = generateId();

  const [number] = await db
    .insert(twilioNumbers)
    .values({
      id,
      tenantId: input.tenantId,
      phoneNumber: input.phoneNumber,
      twilioSid: input.twilioSid,
      friendlyName: input.friendlyName,
      capabilities: input.capabilities ?? { voice: true, sms: false },
      status: 'active',
    })
    .returning();

  await cache.setPhoneMapping(input.phoneNumber, input.tenantId);

  logger.info(
    { tenantId: input.tenantId, phoneNumber: input.phoneNumber },
    'Phone number assigned to tenant',
  );

  return number;
}

export async function resolveTenantByPhone(phoneNumber: string): Promise<string> {
  logger.info({ phoneNumber }, 'Resolving tenant for phone number');
  const cached = await cache.getPhoneMapping(phoneNumber);
  if (cached) {
    logger.info({ phoneNumber, tenantId: cached }, 'Resolved tenant from cache');
    return cached;
  }

  const [number] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.phoneNumber, phoneNumber), eq(twilioNumbers.status, 'active')))
    .limit(1);

  if (!number) {
    logger.warn({ phoneNumber }, 'No active Twilio number found for phone mapping');
    throw new PhoneNumberNotMappedError(phoneNumber);
  }

  await cache.setPhoneMapping(phoneNumber, number.tenantId);

  return number.tenantId;
}

export async function releasePhoneNumber(tenantId: string, numberId: string): Promise<void> {
  const [number] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.id, numberId), eq(twilioNumbers.tenantId, tenantId)))
    .limit(1);

  if (!number) throw new NotFoundError('Phone number not found');

  await db
    .update(twilioNumbers)
    .set({ status: 'released', updatedAt: new Date() })
    .where(eq(twilioNumbers.id, numberId));

  const redis = await cache.getClient();
  if (redis) {
    await redis.del(`phone:${number.phoneNumber}`);
  }

  logger.info({ tenantId, numberId }, 'Phone number released');
}

export async function listPhoneNumbers(tenantId: string): Promise<TwilioNumber[]> {
  return await db
    .select()
    .from(twilioNumbers)
    .where(eq(twilioNumbers.tenantId, tenantId));
}

export async function fetchTwilioIncomingNumbers(): Promise<TwilioIncomingNumber[]> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new TelephonyError('Twilio credentials are not configured');
  }

  const authToken = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
    'utf8',
  ).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PageSize=20`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${authToken}`,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body?.message) detail = body.message;
    } catch {
      // ignore parsing failures
    }
    throw new TelephonyError(`Failed to fetch Twilio numbers: ${detail}`);
  }

  const data = await response.json();
  const numbers = Array.isArray(data?.incoming_phone_numbers)
    ? data.incoming_phone_numbers
    : [];

  return numbers.map((number: any) => ({
    sid: number.sid,
    phoneNumber: number.phone_number,
    friendlyName: number.friendly_name ?? null,
    capabilities: number.capabilities ?? null,
  }));
}

export function createClientAccessToken(input: {
  identity: string;
  ttlSeconds?: number;
}): { token: string; identity: string; expiresIn: number } {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_API_KEY_SID || !env.TWILIO_API_KEY_SECRET) {
    throw new TelephonyError('Twilio API key credentials are not configured');
  }
  if (!env.TWILIO_TWIML_APP_SID) {
    throw new TelephonyError('Twilio TwiML App SID is not configured');
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const ttl = Math.max(300, Math.min(input.ttlSeconds ?? 3600, 24 * 60 * 60));
  const token = new AccessToken(
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_API_KEY_SID,
    env.TWILIO_API_KEY_SECRET,
    { identity: input.identity, ttl },
  );

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  }));

  return {
    token: token.toJwt(),
    identity: input.identity,
    expiresIn: ttl,
  };
}

export async function handleInboundCall(input: {
  callSid: string;
  to: string;
  from: string;
  accountSid: string;
}): Promise<{ tenantId: string; callSessionId: string; configVersionId: string }> {
  logger.info(
    { callSid: input.callSid, to: input.to, from: input.from, accountSid: input.accountSid },
    'Handling inbound call',
  );
  const tenantId = await resolveTenantByPhone(input.to);

  const [twilioNumber] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.phoneNumber, input.to), eq(twilioNumbers.tenantId, tenantId)))
    .limit(1);

  if (!twilioNumber) {
    throw new TelephonyError(`Twilio number not found for ${input.to}`);
  }
  logger.info(
    { tenantId, twilioNumberId: twilioNumber.id, phoneNumber: input.to },
    'Resolved Twilio number for tenant',
  );

  const [activeConfig] = await db
    .select()
    .from(tenantActiveConfig)
    .where(eq(tenantActiveConfig.tenantId, tenantId))
    .limit(1);

  if (!activeConfig) {
    throw new TelephonyError(`No active config version for tenant ${tenantId}`);
  }
  logger.info(
    { tenantId, activeVersion: activeConfig.activeVersion },
    'Resolved active config version',
  );

  const [configVersionRow] = await db
    .select({ id: tenantConfigVersions.id })
    .from(tenantConfigVersions)
    .where(
      and(
        eq(tenantConfigVersions.tenantId, tenantId),
        eq(tenantConfigVersions.version, activeConfig.activeVersion),
      ),
    )
    .limit(1);

  if (!configVersionRow) {
    throw new TelephonyError(`Config version not found for tenant ${tenantId}`);
  }
  logger.info(
    { tenantId, configVersionId: configVersionRow.id },
    'Resolved config version ID',
  );

  const callSession = await callService.createCallSession({
    tenantId,
    twilioCallSid: input.callSid,
    twilioNumberId: twilioNumber.id,
    callerNumber: input.from,
    configVersionId: configVersionRow.id,
  });

  logger.info(
    {
      tenantId,
      callSid: input.callSid,
      callSessionId: callSession.id,
      from: input.from,
      to: input.to,
    },
    'Inbound call received and session created',
  );

  return {
    tenantId,
    callSessionId: callSession.id,
    configVersionId: configVersionRow.id,
  };
}

export async function handleCallStatusUpdate(input: {
  callSid: string;
  callStatus: string;
  callDuration?: string;
}): Promise<void> {
  logger.info(
    { callSid: input.callSid, callStatus: input.callStatus, callDuration: input.callDuration },
    'Handling call status update',
  );
  const [session] = await db
    .select()
    .from(callSessions)
    .where(eq(callSessions.twilioCallSid, input.callSid))
    .limit(1);

  if (!session) {
    logger.warn({ callSid: input.callSid }, 'Status update for unknown call');
    return;
  }

  const statusMap: Record<string, string> = {
    initiated: 'started',
    ringing: 'started',
    'in-progress': 'in_progress',
    completed: 'completed',
    busy: 'failed',
    'no-answer': 'failed',
    canceled: 'failed',
    failed: 'failed',
  };

  const status = statusMap[input.callStatus] || input.callStatus;
  const metadata: Record<string, unknown> = {};

  if (input.callDuration) {
    metadata.durationSeconds = parseInt(input.callDuration, 10);
  }

  if (['completed', 'failed'].includes(status)) {
    metadata.endReason = input.callStatus;
  }

  await callService.updateCallStatus(session.tenantId, session.id, status, metadata);

  logger.info(
    { callSid: input.callSid, status, callSessionId: session.id },
    'Call status updated',
  );
}
