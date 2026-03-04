
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected idle pool client error');
});

pool.on('connect', () => {
  logger.debug('New database connection established');
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
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  logger.info('Draining database pool...');
  await pool.end();
  logger.info('Database pool closed');
}

export { pool, schema };
