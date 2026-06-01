import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { features } from '../config/features.js';
import { db } from './index.js';
import type * as schema from './schema.js';
import { runWithTenantContext } from './tenant-als.js';
import type { TenantExecutionContext } from './tenant-als.js';

// Re-exported so existing `../db/tenant-context.js` imports keep working.
export {
  getTenantExecutionContext,
  getActiveTenantId,
  setActiveTenantContext,
  runWithTenantContext,
  assertTenantAccess,
} from './tenant-als.js';
export type { TenantExecutionContext } from './tenant-als.js';

type AppDb = NodePgDatabase<typeof schema>;
type AppDbTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0];

export async function withTenantTransaction<T>(
  context: TenantExecutionContext,
  callback: (tx: AppDbTransaction) => Promise<T>,
): Promise<T> {
  if (!context.tenantId.trim()) {
    throw new Error('Tenant context is required');
  }

  return runWithTenantContext(context, () =>
    db.transaction(async (tx) => {
      if (features.databaseRls) {
        await tx.execute(
          sql`SELECT set_config('app.current_tenant_id', ${context.tenantId}, true)`,
        );
      }

      return callback(tx);
    }),
  );
}
