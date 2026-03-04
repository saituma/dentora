
import { db } from '../../db/index.js';
import { twilioNumbers, tenantRegistry, callSessions, tenantActiveConfig } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, TelephonyError, PhoneNumberNotMappedError } from '../../lib/errors.js';
import { generateId } from '../../lib/crypto.js';
import * as callService from '../calls/call.service.js';
import type { InferSelectModel } from 'drizzle-orm';
import { tenantConfigVersions } from '../../db/schema.js';

type TwilioNumber = InferSelectModel<typeof twilioNumbers>;

export async function assignPhoneNumber(input: {
  tenantId: string;
  phoneNumber: string;
  twilioSid: string;
  friendlyName?: string;
  capabilities?: Record<string, boolean>;
}): Promise<TwilioNumber> {
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
  const cached = await cache.getPhoneMapping(phoneNumber);
  if (cached) return cached;

  const [number] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.phoneNumber, phoneNumber), eq(twilioNumbers.status, 'active')))
    .limit(1);

  if (!number) {
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

export async function handleInboundCall(input: {
  callSid: string;
  to: string;
  from: string;
  accountSid: string;
}): Promise<{ tenantId: string; callSessionId: string; configVersionId: string }> {
  const tenantId = await resolveTenantByPhone(input.to);

  const [twilioNumber] = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.phoneNumber, input.to), eq(twilioNumbers.tenantId, tenantId)))
    .limit(1);

  if (!twilioNumber) {
    throw new TelephonyError(`Twilio number not found for ${input.to}`);
  }

  const [activeConfig] = await db
    .select()
    .from(tenantActiveConfig)
    .where(eq(tenantActiveConfig.tenantId, tenantId))
    .limit(1);

  if (!activeConfig) {
    throw new TelephonyError(`No active config version for tenant ${tenantId}`);
  }

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
    initiated: 'ringing',
    ringing: 'ringing',
    'in-progress': 'in-progress',
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
