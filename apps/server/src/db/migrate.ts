import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

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

  const pool = new Pool({
    connectionString,
    ssl: resolvePgSsl(connectionString),
  });

  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Migration completed');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
