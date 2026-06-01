import { AsyncLocalStorage } from 'node:async_hooks';
import { AuthorizationError } from '../lib/errors.js';

/**
 * Tenant execution context carried via AsyncLocalStorage. Kept in its own module
 * (no `db` import) so the DB pool can read the active tenant when setting the
 * Postgres `app.current_tenant_id` GUC on checkout without a circular import.
 */
export interface TenantExecutionContext {
  tenantId: string;
  correlationId?: string;
  source: 'request' | 'webhook' | 'worker' | 'test';
}

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
