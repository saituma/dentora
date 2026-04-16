import Stripe from 'stripe';
import { db } from '../../db/index.js';
import { tenantRegistry } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil',
});

const PLAN_PRICE_MAP: Record<string, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID || '',
  growth: process.env.STRIPE_GROWTH_PRICE_ID || '',
  pro: process.env.STRIPE_PRO_PRICE_ID || '',
};

const PRICE_PLAN_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PLAN_PRICE_MAP).map(([plan, priceId]) => [priceId, plan]),
);

export async function createCheckoutSession(input: {
  tenantId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const priceId = PLAN_PRICE_MAP[input.planId];
  if (!priceId) {
    throw new Error(`Unknown plan: ${input.planId}`);
  }

  // Look up existing Stripe customer for this tenant
  const [tenant] = await db
    .select({
      stripeCustomerId: tenantRegistry.stripeCustomerId,
      clinicName: tenantRegistry.clinicName,
    })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, input.tenantId))
    .limit(1);

  let customerId = tenant?.stripeCustomerId ?? undefined;

  if (!customerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      metadata: { tenantId: input.tenantId },
      name: tenant?.clinicName ?? undefined,
    });
    customerId = customer.id;

    await db
      .update(tenantRegistry)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(tenantRegistry.id, input.tenantId));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { tenantId: input.tenantId, planId: input.planId },
    subscription_data: {
      metadata: { tenantId: input.tenantId, planId: input.planId },
    },
  });

  if (!session.url) {
    throw new Error('Failed to create Stripe checkout session');
  }

  return { url: session.url };
}

export async function createBillingPortalSession(input: {
  tenantId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const [tenant] = await db
    .select({ stripeCustomerId: tenantRegistry.stripeCustomerId })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, input.tenantId))
    .limit(1);

  if (!tenant?.stripeCustomerId) {
    throw new Error('No Stripe customer found. Please subscribe to a plan first.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: input.returnUrl,
  });

  return { url: session.url };
}

export async function getSubscriptionStatus(tenantId: string): Promise<{
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
}> {
  const [tenant] = await db
    .select({
      plan: tenantRegistry.plan,
      stripeCustomerId: tenantRegistry.stripeCustomerId,
      stripeSubscriptionId: tenantRegistry.stripeSubscriptionId,
    })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  let currentPeriodEnd: string | null = null;
  let status = 'inactive';

  if (tenant.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      status = sub.status;
      currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
    } catch (err) {
      logger.warn({ err, tenantId }, 'Failed to retrieve Stripe subscription');
      status = 'unknown';
    }
  }

  return {
    plan: tenant.plan,
    status,
    stripeCustomerId: tenant.stripeCustomerId,
    stripeSubscriptionId: tenant.stripeSubscriptionId,
    currentPeriodEnd,
  };
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      const planId = session.metadata?.planId;
      if (!tenantId) {
        logger.warn('checkout.session.completed missing tenantId metadata');
        return;
      }

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

      await db
        .update(tenantRegistry)
        .set({
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
          plan: (planId as any) ?? 'starter',
          updatedAt: new Date(),
        })
        .where(eq(tenantRegistry.id, tenantId));

      logger.info({ tenantId, planId, subscriptionId }, 'Checkout completed — subscription activated');
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId;
      if (!tenantId) return;

      const priceId = subscription.items.data[0]?.price?.id;
      const planId = priceId ? PRICE_PLAN_MAP[priceId] : undefined;

      await db
        .update(tenantRegistry)
        .set({
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId ?? undefined,
          ...(planId ? { plan: planId as any } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenantRegistry.id, tenantId));

      logger.info({ tenantId, planId, status: subscription.status }, 'Subscription updated');
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId;
      if (!tenantId) return;

      await db
        .update(tenantRegistry)
        .set({
          stripeSubscriptionId: null,
          stripePriceId: null,
          plan: 'starter',
          updatedAt: new Date(),
        })
        .where(eq(tenantRegistry.id, tenantId));

      logger.info({ tenantId }, 'Subscription cancelled — reverted to starter');
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe webhook event');
  }
}

export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET || '',
  );
}
