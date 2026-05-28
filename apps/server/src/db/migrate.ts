import 'dotenv/config';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

// Resolve the migrations folder relative to this compiled file, not the process
// CWD. On Heroku the release command runs from the repo root (/app), so a bare
// 'drizzle' would miss the real folder at apps/server/drizzle.
// dist/db/migrate.js → ../../drizzle = apps/server/drizzle
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

function getRawMigrationUrl(): string {
  return (
    process.env.MIGRATION_DATABASE_URL ??
    process.env.DATABASE_DIRECT_URL ??
    process.env.DATABASE_URL ??
    ''
  );
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
    parsedUrl.searchParams.set('sslmode', sslMode ?? 'require');
  }

  return parsedUrl.toString();
}

function resolvePgSsl(
  connectionString: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
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
  const timeoutMs = Math.max(5000, Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '30000'));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pool = new Pool({
      connectionString,
      ssl: resolvePgSsl(connectionString),
      connectionTimeoutMillis: timeoutMs,
      max: 1,
    });

    const db = drizzle(pool);

    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      // eslint-disable-next-line no-console
      console.log('Migration completed');
      await pool.end();
      return;
    } catch (error) {
      await pool.end();
      const fullMessage = [error, (error as { cause?: unknown }).cause]
        .map((e) => (e instanceof Error ? e.message : String(e ?? '')))
        .join(' ');
      const isLastAttempt = attempt >= maxAttempts;
      const shouldRetry = /ETIMEDOUT|timeout|ECONNRESET|ENETUNREACH|EHOSTUNREACH|terminated/i.test(
        fullMessage,
      );

      if (!shouldRetry || isLastAttempt) {
        throw error;
      }

      const delayMs = attempt * 1500;
      console.warn(
        `Migration attempt ${attempt}/${maxAttempts} failed (${fullMessage}). Retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
