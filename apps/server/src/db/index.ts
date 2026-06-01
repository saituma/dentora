import path from 'path';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema.js';
import { env } from '../config/env.js';
import { features } from '../config/features.js';
import { logger } from '../lib/logger.js';
import { getActiveTenantId } from './tenant-als.js';

function buildConnectionString(rawUrl: string): string {
  const parsedUrl = new URL(rawUrl);

  if (parsedUrl.searchParams.has('channel_binding')) {
    parsedUrl.searchParams.delete('channel_binding');
    logger.warn('Removed unsupported channel_binding from DATABASE_URL');
  }

  return parsedUrl.toString();
}

function hostLooksLikeManagedPostgres(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h.includes('render.com') ||
    h.includes('neon.tech') ||
    h.includes('amazonaws.com') ||
    h.includes('supabase.co') ||
    h.includes('pooler.supabase.com')
  );
}

/**
 * SSL for node-postgres. Prefer sslmode on the URL (common on Neon / Render),
 * then DATABASE_SSL_MODE, then require TLS for known managed Postgres hosts.
 */
function resolvePgSsl(
  connectionString: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  const url = new URL(connectionString);
  const fromUrl = url.searchParams.get('sslmode');
  let mode = fromUrl ?? env.DATABASE_SSL_MODE;
  if (!fromUrl && hostLooksLikeManagedPostgres(url.hostname) && mode === 'disable') {
    mode = 'require';
  }

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

/**
 * Set the Postgres `app.current_tenant_id` GUC on every connection checkout from
 * the active tenant context, so RLS policies enforce isolation for ALL queries —
 * not just those wrapped in withTenantTransaction. Setting it on every checkout
 * (to '' when there is no context) prevents a stale value from a prior request
 * leaking on a pooled connection, and makes RLS fail closed outside a context.
 *
 * No-op unless FF_DATABASE_RLS is on, so shipping this code with the flag off
 * changes nothing at runtime — enabling the flag is the activation switch.
 */
function installTenantGuc(target: Pool): void {
  if (!features.databaseRls) return;

  const originalConnect = target.connect.bind(target);

  const applyGuc = async (client: PoolClient): Promise<void> => {
    const tenantId = getActiveTenantId() ?? '';
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
  };

  target.connect = ((
    cb?: (err: Error | undefined, client?: PoolClient, done?: (release?: unknown) => void) => void,
  ) => {
    if (typeof cb === 'function') {
      originalConnect((err, client, done) => {
        if (err || !client) {
          cb(err, client, done);
          return;
        }
        applyGuc(client).then(
          () => cb(err, client, done),
          (gucErr: Error) => cb(gucErr, client, done),
        );
      });
      return undefined;
    }
    return (originalConnect() as Promise<PoolClient>).then(async (client) => {
      await applyGuc(client);
      return client;
    });
  }) as typeof target.connect;
}

const connectionString = buildConnectionString(env.DATABASE_URL);

const pool = new Pool({
  connectionString,
  max: env.DATABASE_POOL_SIZE,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: 10000,
  ssl: resolvePgSsl(connectionString),
});
installTenantGuc(pool);

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === 'development' });

// Read replica — use for analytics and read-heavy queries to offload primary.
// Falls back to primary if DATABASE_REPLICA_URL is not set.
const replicaConnectionString = env.DATABASE_REPLICA_URL
  ? buildConnectionString(env.DATABASE_REPLICA_URL)
  : connectionString;

const replicaPool = new Pool({
  connectionString: replicaConnectionString,
  max: Math.ceil(env.DATABASE_POOL_SIZE / 2),
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: 10000,
  ssl: resolvePgSsl(replicaConnectionString),
});
installTenantGuc(replicaPool);

export const dbReplica = drizzle(replicaPool, { schema, logger: false });

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

export async function runMigrations(): Promise<void> {
  // __dirname = dist/db/; migrations live at apps/server/drizzle/ (two levels up from dist/db/)
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  logger.info({ migrationsFolder }, 'Running database migrations');
  await migrate(db, { migrationsFolder });
  logger.info('Database migrations complete');
}
