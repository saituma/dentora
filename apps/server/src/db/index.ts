import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

// WebSocket required in Node.js for transaction support (neon-http does not support transactions)
neonConfig.webSocketConstructor = ws;

function buildConnectionString(rawUrl: string): string {
  const parsedUrl = new URL(rawUrl);

  if (parsedUrl.searchParams.has('channel_binding')) {
    parsedUrl.searchParams.delete('channel_binding');
    logger.warn('Removed unsupported channel_binding from DATABASE_URL');
  }

  return parsedUrl.toString();
}

const connectionString = buildConnectionString(env.DATABASE_URL);
const pool = new Pool({ connectionString });

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
