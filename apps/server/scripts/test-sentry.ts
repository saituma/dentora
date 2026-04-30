/**
 * Sends a one-off test error to Sentry so you can confirm the DSN and (if configured) alert emails.
 *
 * Email is not sent by this script. Sentry only emails when an **Alert rule** matches (e.g. “new issue”)
 * and your account is subscribed. Each run uses a unique fingerprint so this counts as a **new issue**
 * (repeat runs were previously grouped into one issue, so “new issue” emails only fired once).
 *
 * Usage (from repo root):
 *   pnpm --filter @repo/server test:sentry
 *
 * Or from apps/server:
 *   pnpm test:sentry
 *
 * Env (first match wins after loading files): SENTRY_DSN, then NEXT_PUBLIC_SENTRY_DSN.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import * as Sentry from '@sentry/node';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(scriptDir, '..');
const repoRoot = path.join(serverRoot, '..', '..');

loadEnv({ path: path.join(repoRoot, '.env') });
loadEnv({ path: path.join(serverRoot, '.env'), override: true });
loadEnv({ path: path.join(repoRoot, 'apps', 'client', '.env.local'), override: true });

async function main(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (!dsn) {
    console.error(
      'Missing SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN.\n' +
        'Set one in apps/server/.env and/or apps/client/.env.local (or export in the shell), then retry.',
    );
    process.exit(1);
  }

  const runId = randomUUID();
  const tag = `[Sentry test ${new Date().toISOString()}]`;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
  });

  Sentry.withScope((scope) => {
    scope.setFingerprint(['dental-work-sentry-test', runId]);
    scope.setTag('source', 'test-sentry-script');
    scope.setContext('test', { runId, script: 'apps/server/scripts/test-sentry.ts' });
    Sentry.captureException(
      new Error(`${tag} runId=${runId} — manual test from dental-work`),
    );
  });

  await Sentry.flush(5000);
  await Sentry.close(2000);

  console.log(`Sent test error to Sentry (runId=${runId}).`);
  console.log('1) Open Issues in this project and confirm a new issue (search runId if needed).');
  console.log('2) Email: Sentry → User settings (avatar) → Notifications — enable Issue alerts by email.');
  console.log('3) Project → Alerts — add a rule like “A new issue is created” → notify via email (or team).');
  console.log('4) Check spam; new accounts sometimes delay first mail a few minutes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
