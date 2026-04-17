import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { tenantRegistry } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';

type DbTenantPlan = 'starter' | 'professional' | 'enterprise';

/** Checkout / marketing plan ids → `tenant_registry.plan` enum values */
function checkoutPlanToDbPlan(plan: string | undefined): DbTenantPlan {
  switch (plan) {
    case 'growth':
      return 'professional';
    case 'pro':
      return 'enterprise';
    case 'starter':
    default:
      return 'starter';
  }
}

type StripeClient = InstanceType<typeof Stripe>;

let stripeSingleton: StripeClient | null = null;

function getStripe(): StripeClient {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new AppError(
      'Payments are not configured: set STRIPE_SECRET_KEY on the server (e.g. in Render environment variables).',
      503,
      'STRIPE_NOT_CONFIGURED',
    );
  }
  stripeSingleton ??= new Stripe(key, { apiVersion: Stripe.API_VERSION });
  return stripeSingleton;
}

function priceIdForCheckoutPlan(planId: string): string {
  const id =
    planId === 'starter'
      ? env.STRIPE_STARTER_PRICE_ID
      : planId === 'growth'
        ? env.STRIPE_GROWTH_PRICE_ID
        : planId === 'pro'
          ? env.STRIPE_PRO_PRICE_ID
          : '';
  return (id ?? '').trim();
}

function assertPriceConfigured(planId: string): string {
  const priceId = priceIdForCheckoutPlan(planId);
  if (!priceId) {
    const envName =
      planId === 'starter'
        ? 'STRIPE_STARTER_PRICE_ID'
        : planId === 'growth'
          ? 'STRIPE_GROWTH_PRICE_ID'
          : planId === 'pro'
            ? 'STRIPE_PRO_PRICE_ID'
            : 'STRIPE_*_PRICE_ID';
    throw new AppError(
      `Payments are not configured for plan "${planId}": set ${envName} to your Stripe Price id (price_...) in the server environment.`,
      503,
      'STRIPE_PRICE_NOT_CONFIGURED',
      true,
      { planId, envName },
    );
  }
  return priceId;
}

const PRICE_PLAN_MAP: Record<string, string> = (() => {
  const entries: Array<[string, string]> = [];
  const pairs: Array<[string, string]> = [
    [env.STRIPE_STARTER_PRICE_ID?.trim() ?? '', 'starter'],
    [env.STRIPE_GROWTH_PRICE_ID?.trim() ?? '', 'growth'],
    [env.STRIPE_PRO_PRICE_ID?.trim() ?? '', 'pro'],
  ];
  for (const [priceId, plan] of pairs) {
    if (priceId) entries.push([priceId, plan]);
  }
  return Object.fromEntries(entries);
})();

type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type StripeCheckoutSession = Awaited<ReturnType<StripeClient['checkout']['sessions']['retrieve']>>;
type StripeSubscription = Awaited<ReturnType<StripeClient['subscriptions']['retrieve']>>;

function isStripeApiError(err: unknown): err is { message: string; statusCode?: number; code?: string; type?: string } {
  if (typeof err !== 'object' || err === null) return false;
  const o = err as Record<string, unknown>;
  return typeof o.type === 'string' && typeof o.message === 'string';
}

function rethrowStripeAsAppError(err: unknown): never {
  if (err instanceof AppError) {
    throw err;
  }
  if (isStripeApiError(err)) {
    logger.warn(
      { stripeMessage: err.message, stripeCode: err.code, stripeType: err.type },
      'Stripe API error',
    );
    const status =
      err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 502;
    throw new AppError(err.message || 'Stripe request failed', status, 'STRIPE_API_ERROR', true, {
      stripeCode: err.code,
      stripeType: err.type,
    });
  }
  throw err;
}

export async function createCheckoutSession(input: {
  tenantId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const priceId = assertPriceConfigured(input.planId);

  const [tenant] = await db
    .select({
      stripeCustomerId: tenantRegistry.stripeCustomerId,
      clinicName: tenantRegistry.clinicName,
    })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, input.tenantId))
    .limit(1);

  let customerId = tenant?.stripeCustomerId ?? undefined;

  try {
    const stripe = getStripe();

    if (!customerId) {
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
      throw new AppError('Stripe did not return a checkout URL', 502, 'STRIPE_CHECKOUT_NO_URL');
    }

    return { url: session.url };
  } catch (err) {
    rethrowStripeAsAppError(err);
  }
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
    throw new AppError(
      'No Stripe customer found. Complete checkout first.',
      400,
      'STRIPE_CUSTOMER_MISSING',
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  } catch (err) {
    rethrowStripeAsAppError(err);
  }
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
    throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND', true, { tenantId });
  }

  let currentPeriodEnd: string | null = null;
  let status = 'inactive';

  if (tenant.stripeSubscriptionId) {
    try {
      const sub = await getStripe().subscriptions.retrieve(tenant.stripeSubscriptionId);
      status = sub.status;
      const periodEndUnix = sub.items.data[0]?.current_period_end;
      if (periodEndUnix != null) {
        currentPeriodEnd = new Date(periodEndUnix * 1000).toISOString();
      }
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

export async function handleWebhookEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutSession;
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
        typeof session.customer === 'string' ? session.customer : session.customer?.id;

      await db
        .update(tenantRegistry)
        .set({
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
          plan: checkoutPlanToDbPlan(planId),
          updatedAt: new Date(),
        })
        .where(eq(tenantRegistry.id, tenantId));

      logger.info({ tenantId, planId, subscriptionId }, 'Checkout completed — subscription activated');
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as StripeSubscription;
      const tenantId = subscription.metadata?.tenantId;
      if (!tenantId) return;

      const priceId = subscription.items.data[0]?.price?.id;
      const checkoutPlan = priceId ? PRICE_PLAN_MAP[priceId] : undefined;
      const dbPlan = checkoutPlan ? checkoutPlanToDbPlan(checkoutPlan) : undefined;

      await db
        .update(tenantRegistry)
        .set({
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId ?? undefined,
          ...(dbPlan ? { plan: dbPlan } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenantRegistry.id, tenantId));

      logger.info({ tenantId, checkoutPlan, status: subscription.status }, 'Subscription updated');
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSubscription;
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

export function constructWebhookEvent(payload: Buffer, signature: string): StripeEvent {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new AppError(
      'Stripe webhooks are not configured: set STRIPE_WEBHOOK_SECRET on the server.',
      503,
      'STRIPE_WEBHOOK_NOT_CONFIGURED',
    );
  }
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}
