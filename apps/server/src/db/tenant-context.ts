import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { features } from '../config/features.js';
import { AuthorizationError } from '../lib/errors.js';
import { db } from './index.js';
import type * as schema from './schema.js';

export interface TenantExecutionContext {
  tenantId: string;
  correlationId?: string;
  source: 'request' | 'webhook' | 'worker' | 'test';
}

type AppDb = NodePgDatabase<typeof schema>;
type AppDbTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0];

const tenantStorage = new AsyncLocalStorage<TenantExecutionContext>();

function assertNonEmptyTenantId(tenantId: string): void {
  if (!tenantId.trim()) {
    throw new AuthorizationError('Tenant context is required');
  }
}

export function getTenantExecutionContext(): TenantExecutionContext | undefined {
  return tenantStorage.getStore();
}

export function getActiveTenantId(): string | undefined {
  return getTenantExecutionContext()?.tenantId;
}

export function setActiveTenantContext(context: TenantExecutionContext): void {
  assertNonEmptyTenantId(context.tenantId);
  tenantStorage.enterWith(context);
}

export function runWithTenantContext<T>(context: TenantExecutionContext, callback: () => T): T {
  assertNonEmptyTenantId(context.tenantId);
  return tenantStorage.run(context, callback);
}

export function assertTenantAccess(expectedTenantId: string): string {
  assertNonEmptyTenantId(expectedTenantId);
  const activeTenantId = getActiveTenantId();

  if (!activeTenantId) {
    throw new AuthorizationError('Tenant context is required for tenant-scoped data access');
  }

  if (activeTenantId !== expectedTenantId) {
    throw new AuthorizationError('Cannot access another tenant', {
      activeTenantId,
      requestedTenantId: expectedTenantId,
    });
  }

  return activeTenantId;
}

export async function withTenantTransaction<T>(
  context: TenantExecutionContext,
  callback: (tx: AppDbTransaction) => Promise<T>,
): Promise<T> {
  assertNonEmptyTenantId(context.tenantId);

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
