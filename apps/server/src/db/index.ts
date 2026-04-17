import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

function buildConnectionString(rawUrl: string): string {
  const parsedUrl = new URL(rawUrl);

  if (parsedUrl.searchParams.has('channel_binding')) {
    parsedUrl.searchParams.delete('channel_binding');
    logger.warn('Removed unsupported channel_binding from DATABASE_URL');
  }

  return parsedUrl.toString();
}

/**
 * SSL for node-postgres. Prefer sslmode on the URL (common on Neon / Render),
 * then DATABASE_SSL_MODE.
 */
function resolvePgSsl(connectionString: string): boolean | { rejectUnauthorized: boolean } | undefined {
  const url = new URL(connectionString);
  const fromUrl = url.searchParams.get('sslmode');
  const mode = fromUrl ?? env.DATABASE_SSL_MODE;

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

const connectionString = buildConnectionString(env.DATABASE_URL);

const pool = new Pool({
  connectionString,
  max: env.DATABASE_POOL_SIZE,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  ssl: resolvePgSsl(connectionString),
});

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === 'development' });

export async function checkDbHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Database health check query failed');
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export { schema };
