/**
 * Minimal Stripe client over fetch — no SDK dependency.
 *
 * Scope: patient deposit collection via Stripe Checkout, charged DIRECTLY on each clinic's
 * connected account (Stripe Connect direct charge via the `Stripe-Account` header). Funds land
 * in the clinic's account, never the platform's.
 *
 * Safety: every call requires STRIPE_SECRET_KEY. With test-mode keys (sk_test_…) no real money
 * moves, so this is safe to run in dev. isStripeConfigured() lets callers short-circuit.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export function isStripeConfigured(): boolean {
  return env.STRIPE_SECRET_KEY.length > 0;
}

export interface CheckoutSessionInput {
  /** The clinic's connected Stripe account id (acct_…). */
  connectedAccountId: string;
  /** Amount in major units (e.g. pounds). Converted to minor units internally. */
  amount: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds; Stripe requires 30 min – 24 h from now. */
  expiresAt?: number;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  paymentIntentId: string | null;
  expiresAt: number | null;
}

function appendMetadata(form: URLSearchParams, metadata: Record<string, string> | undefined): void {
  if (!metadata) return;
  for (const [key, value] of Object.entries(metadata)) {
    form.append(`metadata[${key}]`, value);
  }
}

async function stripePost(
  path: string,
  form: URLSearchParams,
  connectedAccountId?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': env.STRIPE_API_VERSION,
  };
  if (connectedAccountId) headers['Stripe-Account'] = connectedAccountId;

  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: form.toString(),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const error = json.error as { message?: string; type?: string } | undefined;
    throw new Error(`Stripe ${path} failed (${res.status}): ${error?.message ?? 'unknown error'}`);
  }
  return json;
}

/**
 * Creates a Checkout Session for a one-off deposit on the clinic's connected account.
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('success_url', input.successUrl);
  form.append('cancel_url', input.cancelUrl);
  form.append('line_items[0][quantity]', '1');
  form.append('line_items[0][price_data][currency]', input.currency);
  form.append('line_items[0][price_data][unit_amount]', String(Math.round(input.amount * 100)));
  form.append('line_items[0][price_data][product_data][name]', input.description);
  if (input.expiresAt) form.append('expires_at', String(input.expiresAt));
  appendMetadata(form, input.metadata);
  // Mirror metadata onto the PaymentIntent so it survives onto the charge/refund objects.
  if (input.metadata) {
    for (const [key, value] of Object.entries(input.metadata)) {
      form.append(`payment_intent_data[metadata][${key}]`, value);
    }
  }

  const session = await stripePost('/checkout/sessions', form, input.connectedAccountId);

  return {
    id: String(session.id),
    url: typeof session.url === 'string' ? session.url : null,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    expiresAt: typeof session.expires_at === 'number' ? session.expires_at : null,
  };
}

export interface StripeEvent {
  id: string;
  type: string;
  /** Connected account id when the event originated on a connected account. */
  account?: string;
  data: { object: Record<string, unknown> };
}

/**
 * Verifies a Stripe webhook signature against the raw request body and returns the parsed event.
 * Implements Stripe's scheme (`t=…,v1=…`) with a 5-minute replay window. Throws on any mismatch.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): StripeEvent {
  if (!signatureHeader) throw new Error('Missing Stripe-Signature header');
  if (!secret) throw new Error('Stripe webhook secret is not configured');

  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('Malformed Stripe-Signature header');

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
    throw new Error('Stripe signature mismatch');
  }

  // Replay protection: reject events older than 5 minutes.
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error('Stripe webhook timestamp outside tolerance');
  }

  const event = JSON.parse(rawBody) as StripeEvent;
  logger.debug({ eventId: event.id, type: event.type }, 'Verified Stripe webhook event');
  return event;
}
