import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

function getRawMigrationUrl(): string {
  return (
    process.env.MIGRATION_DATABASE_URL ??
    process.env.DATABASE_DIRECT_URL ??
    process.env.DATABASE_URL!
  );
}

function buildMigrationDatabaseUrl(rawUrl: string, sslMode?: string): string {
  const parsedUrl = new URL(rawUrl);

  if (parsedUrl.searchParams.has('channel_binding')) {
    parsedUrl.searchParams.delete('channel_binding');
  }

  if (!parsedUrl.searchParams.has('sslmode') && sslMode && sslMode !== 'disable') {
    parsedUrl.searchParams.set('sslmode', sslMode);
  }

  return parsedUrl.toString();
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: buildMigrationDatabaseUrl(getRawMigrationUrl(), process.env.DATABASE_SSL_MODE),
  },
});
