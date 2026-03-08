import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

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

async function main(): Promise<void> {
  const connectionString = buildMigrationDatabaseUrl(
    getRawMigrationUrl(),
    process.env.DATABASE_SSL_MODE,
  );

  const sql = neon(connectionString);
  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migration completed');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
