/**
 * Patient deposit collection.
 *
 * Flow:
 *  1. createAndSendDeposit() runs when an appointment is booked (inside tenant context).
 *     If the tenant has deposits enabled + a connected Stripe account, it creates a deposit row,
 *     opens a Stripe Checkout session on the clinic's connected account, and texts the patient
 *     the payment link.
 *  2. The patient pays; Stripe calls our webhook; handleStripeEvent() marks the deposit paid.
 *
 * Safety / scope:
 *  - Gated by FF_DEPOSIT_COLLECTION (off by default).
 *  - A complete no-op unless STRIPE_SECRET_KEY is set AND the tenant has a connected account —
 *    so the logic ships dormant until Stripe is actually wired up.
 *  - The payment link is a transactional message (it secures the patient's own booking), so it is
 *    not gated by marketing-reminder consent.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { deposits, tenantRegistry } from '../../db/schema.js';
import { assertTenantAccess, runWithTenantContext } from '../../db/tenant-context.js';
import { features } from '../../config/features.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { createCheckoutSession, isStripeConfigured, type StripeEvent } from '../../lib/stripe.js';
import { sendPatientMessage, type MessageChannel } from '../../lib/twilio-messaging.js';
import { getPatientProfileById } from '../patients/patients.service.js';
import { getClinicProfile } from '../config/config.service.js';

const THIRTY_MIN_MS = 30 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

type TenantDepositConfig = {
  depositEnabled: boolean;
  depositAmount: number | null;
  depositCurrency: string;
  stripeConnectAccountId: string | null;
};

async function getTenantDepositConfig(tenantId: string): Promise<TenantDepositConfig | null> {
  const [row] = await db
    .select({
      depositEnabled: tenantRegistry.depositEnabled,
      depositAmount: tenantRegistry.depositAmount,
      depositCurrency: tenantRegistry.depositCurrency,
      stripeConnectAccountId: tenantRegistry.stripeConnectAccountId,
    })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, tenantId))
    .limit(1);
  if (!row) return null;
  return {
    depositEnabled: row.depositEnabled,
    depositAmount: row.depositAmount != null ? Number(row.depositAmount) : null,
    depositCurrency: row.depositCurrency,
    stripeConnectAccountId: row.stripeConnectAccountId,
  };
}

/** Stripe requires expiry 30 min – 24 h out. Returns unix seconds, or undefined to use the default. */
function computeExpiry(startAt: Date): number | undefined {
  const now = Date.now();
  const target = Math.min(now + TWENTY_FOUR_H_MS, startAt.getTime());
  if (target < now + THIRTY_MIN_MS) return undefined;
  return Math.floor(target / 1000);
}

function formatAmount(amount: number, currency: string): string {
  const symbol = currency.toLowerCase() === 'gbp' ? '£' : '';
  return `${symbol}${amount.toFixed(2)}`;
}

async function sendDepositLink(input: {
  tenantId: string;
  channel: MessageChannel;
  to: string;
  clinicName: string;
  amountLabel: string;
  url: string;
}): Promise<void> {
  const body = `${input.clinicName}: To secure your appointment, please pay your ${input.amountLabel} deposit here: ${input.url}`;
  const result = await sendPatientMessage({
    tenantId: input.tenantId,
    channel: input.channel,
    to: input.to,
    body,
  });
  if (!result.sent) {
    logger.warn(
      { tenantId: input.tenantId, reason: result.reason },
      'Deposit payment link could not be sent',
    );
  }
}

/**
 * Creates and sends a deposit for a freshly-booked appointment. Best-effort: never throws into
 * the booking path.
 */
export async function createAndSendDeposit(input: {
  tenantId: string;
  appointmentId: string;
  patientId: string;
  startAt: Date;
}): Promise<void> {
  if (!features.depositCollection) return;
  assertTenantAccess(input.tenantId);

  try {
    const config = await getTenantDepositConfig(input.tenantId);
    if (!config?.depositEnabled || !config.depositAmount || config.depositAmount <= 0) return;

    // Dormant until Stripe is wired up: no keys or no connected account → no-op.
    if (!isStripeConfigured() || !config.stripeConnectAccountId) {
      logger.info(
        { tenantId: input.tenantId, appointmentId: input.appointmentId },
        'Deposit skipped — Stripe not configured for this tenant',
      );
      return;
    }

    const [deposit] = await db
      .insert(deposits)
      .values({
        tenantId: input.tenantId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        amount: config.depositAmount.toFixed(2),
        currency: config.depositCurrency,
      })
      .onConflictDoNothing({ target: [deposits.tenantId, deposits.appointmentId] })
      .returning();

    // Already had a deposit for this appointment.
    if (!deposit) return;

    const patient = await getPatientProfileById({
      tenantId: input.tenantId,
      patientId: input.patientId,
    });
    if (!patient?.phoneNumber) {
      logger.info({ tenantId: input.tenantId }, 'Deposit created but patient has no phone number');
      return;
    }

    const clinic = await getClinicProfile(input.tenantId);
    const clinicName = clinic?.clinicName ?? 'Your dental practice';

    const session = await createCheckoutSession({
      connectedAccountId: config.stripeConnectAccountId,
      amount: config.depositAmount,
      currency: config.depositCurrency,
      description: `${clinicName} appointment deposit`,
      successUrl: `${env.CLIENT_URL}/deposit/success`,
      cancelUrl: `${env.CLIENT_URL}/deposit/cancelled`,
      expiresAt: computeExpiry(input.startAt),
      metadata: {
        depositId: deposit.id,
        tenantId: input.tenantId,
        appointmentId: input.appointmentId,
      },
    });

    await db
      .update(deposits)
      .set({
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: session.paymentIntentId,
        checkoutUrl: session.url,
        expiresAt: session.expiresAt ? new Date(session.expiresAt * 1000) : null,
        status: 'link_sent',
        updatedAt: new Date(),
      })
      .where(and(eq(deposits.tenantId, input.tenantId), eq(deposits.id, deposit.id)));

    if (session.url) {
      const channel: MessageChannel =
        patient.preferredReminderChannel === 'whatsapp' ? 'whatsapp' : 'sms';
      await sendDepositLink({
        tenantId: input.tenantId,
        channel,
        to: patient.phoneNumber,
        clinicName,
        amountLabel: formatAmount(config.depositAmount, config.depositCurrency),
        url: session.url,
      });
    }
  } catch (err) {
    logger.error(
      { err, tenantId: input.tenantId, appointmentId: input.appointmentId },
      'Failed to create/send deposit',
    );
  }
}

/** Returns the deposit for an appointment, or null. */
export async function getDepositByAppointmentId(input: {
  tenantId: string;
  appointmentId: string;
}): Promise<typeof deposits.$inferSelect | null> {
  assertTenantAccess(input.tenantId);
  const [row] = await db
    .select()
    .from(deposits)
    .where(
      and(eq(deposits.tenantId, input.tenantId), eq(deposits.appointmentId, input.appointmentId)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Handles a verified Stripe webhook event. Runs without tenant context — it looks the deposit up
 * by Stripe id, then applies updates within the owning tenant's context.
 */
export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const sessionId = typeof object.id === 'string' ? object.id : null;
      if (!sessionId) return;
      const paymentIntentId =
        typeof object.payment_intent === 'string' ? object.payment_intent : null;
      await markDepositBySession(sessionId, {
        status: 'paid',
        paidAt: new Date(),
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      });
      return;
    }
    case 'checkout.session.expired': {
      const sessionId = typeof object.id === 'string' ? object.id : null;
      if (!sessionId) return;
      await markDepositBySession(sessionId, { status: 'expired' }, ['pending', 'link_sent']);
      return;
    }
    default:
      logger.debug({ type: event.type }, 'Ignoring unhandled Stripe event');
  }
}

async function markDepositBySession(
  sessionId: string,
  patch: Partial<typeof deposits.$inferInsert>,
  onlyFromStatuses?: Array<typeof deposits.$inferSelect.status>,
): Promise<void> {
  const [deposit] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.stripeCheckoutSessionId, sessionId))
    .limit(1);

  if (!deposit) {
    logger.warn({ sessionId }, 'Stripe event for unknown deposit session');
    return;
  }
  if (onlyFromStatuses && !onlyFromStatuses.includes(deposit.status)) return;
  // Idempotent: don't downgrade a paid deposit.
  if (deposit.status === 'paid' && patch.status !== 'refunded') return;

  await runWithTenantContext({ tenantId: deposit.tenantId, source: 'webhook' }, () =>
    db
      .update(deposits)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(deposits.tenantId, deposit.tenantId), eq(deposits.id, deposit.id))),
  );
  logger.info(
    { tenantId: deposit.tenantId, depositId: deposit.id, status: patch.status },
    'Deposit status updated from Stripe event',
  );
}
