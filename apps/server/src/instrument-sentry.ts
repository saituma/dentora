import * as Sentry from '@sentry/node';
import { env } from './config/env.js';

let started = false;

export function initSentry(): void {
  if (started || !env.SENTRY_DSN) return;
  started = true;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1,
    sendDefaultPii: false,
  });
}

export async function closeSentry(): Promise<void> {
  if (!env.SENTRY_DSN) return;
  await Sentry.close(2000);
}
