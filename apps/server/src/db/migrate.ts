import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

function looksLikeNeonPoolerHost(hostname: string): boolean {
  return hostname.includes('-pooler.') && hostname.includes('.neon.tech');
}

function tryBuildDirectNeonUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!looksLikeNeonPoolerHost(parsed.hostname)) return null;
    parsed.hostname = parsed.hostname.replace('-pooler.', '.');
    return parsed.toString();
  } catch {
    return null;
  }
}

function getRawMigrationUrl(): string {
  const explicitRaw =
    process.env.MIGRATION_DATABASE_URL ??
    process.env.DATABASE_DIRECT_URL;
  if (explicitRaw) {
    const explicitDirect = tryBuildDirectNeonUrl(explicitRaw);
    return explicitDirect ?? explicitRaw;
  }

  const fallback = process.env.DATABASE_URL ?? '';
  const derivedDirect = tryBuildDirectNeonUrl(fallback);
  return derivedDirect ?? fallback;
}

function buildMigrationDatabaseUrl(rawUrl: string, sslMode?: string): string {
  if (!rawUrl) {
    throw new Error('Missing MIGRATION_DATABASE_URL, DATABASE_DIRECT_URL, or DATABASE_URL');
  }

  const parsedUrl = new URL(rawUrl);

  if (parsedUrl.searchParams.has('channel_binding')) {
    parsedUrl.searchParams.delete('channel_binding');
  }

  if (!parsedUrl.searchParams.has('sslmode')) {
    parsedUrl.searchParams.set('sslmode', sslMode && sslMode !== 'disable' ? sslMode : 'require');
  }

  return parsedUrl.toString();
}

function resolvePgSsl(connectionString: string): boolean | { rejectUnauthorized: boolean } | undefined {
  const url = new URL(connectionString);
  const mode = url.searchParams.get('sslmode') ?? 'require';
  if (mode === 'disable' || mode === 'allow' || mode === 'prefer') {
    return undefined;
  }
  if (mode === 'require') {
    return { rejectUnauthorized: false };
  }
  if (mode === 'verify-ca' || mode === 'verify-full') {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

async function main(): Promise<void> {
  const connectionString = buildMigrationDatabaseUrl(
    getRawMigrationUrl(),
    process.env.DATABASE_SSL_MODE,
  );
  const safeHost = (() => {
    try {
      return new URL(connectionString).host;
    } catch {
      return 'unknown-host';
    }
  })();
  // eslint-disable-next-line no-console
  console.log(`Running migrations against: ${safeHost}`);

  const maxAttempts = Math.max(1, Number(process.env.MIGRATION_RETRY_ATTEMPTS ?? '3'));
  const timeoutMs = Math.max(5000, Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '15000'));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pool = new Pool({
      connectionString,
      ssl: resolvePgSsl(connectionString),
      connectionTimeoutMillis: timeoutMs,
      max: 1,
    });

    const db = drizzle(pool);

    try {
      await migrate(db, { migrationsFolder: 'drizzle' });
      // eslint-disable-next-line no-console
      console.log('Migration completed');
      await pool.end();
      return;
    } catch (error) {
      await pool.end();
      const message = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt >= maxAttempts;
      const shouldRetry = /ETIMEDOUT|timeout|ECONNRESET|ENETUNREACH|EHOSTUNREACH/i.test(message);

      if (!shouldRetry || isLastAttempt) {
        throw error;
      }

      const delayMs = attempt * 1500;
      console.warn(`Migration attempt ${attempt}/${maxAttempts} failed (${message}). Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
