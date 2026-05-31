import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  users,
  tenantUsers,
  tenantRegistry,
  sessions,
  authIdentities,
  passwordResetTokens,
  tenantApiKeys,
  staffReviewItems,
  clinicHistoryFiles,
  calendarPhiRemediationRuns,
} from '../../db/schema.js';
import { tenantCacheInvalidateDomain } from '../../lib/cache.js';

export type TenantPlan = 'starter' | 'professional' | 'enterprise';
/** Tenant-membership roles an admin may assign (never platform_admin). */
export type AssignableTenantRole = 'owner' | 'admin' | 'manager' | 'viewer';
export const ASSIGNABLE_TENANT_ROLES: AssignableTenantRole[] = [
  'owner',
  'admin',
  'manager',
  'viewer',
];

/** Change a clinic's plan tier and invalidate its cached registry/config. */
export async function updateTenantPlan(tenantId: string, plan: TenantPlan): Promise<void> {
  await db
    .update(tenantRegistry)
    .set({ plan, updatedAt: new Date() })
    .where(eq(tenantRegistry.id, tenantId));
  await tenantCacheInvalidateDomain(tenantId, 'registry');
  await tenantCacheInvalidateDomain(tenantId, 'config');
}

/** Update a user's role within one tenant. Refuses platform_admin escalation. */
export async function updateTenantUserRole(
  tenantId: string,
  userId: string,
  role: AssignableTenantRole,
): Promise<void> {
  await db
    .update(tenantUsers)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)));
}

/** Admin force-clear a user's MFA (e.g. locked-out staff). No password required. */
export async function adminResetMfa(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [], updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Admin force-mark a user's email as verified. */
export async function adminVerifyEmail(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Force-logout: delete all refresh sessions for a user. Returns rows removed. */
export async function revokeUserSessions(userId: string): Promise<number> {
  const removed = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({
    id: sessions.id,
  });
  return removed.length;
}

export interface ImpersonationTarget {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

/**
 * Resolve the token payload for impersonating a clinic user. Refuses users with
 * no tenant membership and platform admins (no impersonating other admins).
 */
export async function getImpersonationTarget(userId: string): Promise<ImpersonationTarget> {
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error('User not found');
  if (user.role === 'platform_admin') throw new Error('Cannot impersonate a platform admin');

  const [membership] = await db
    .select({ tenantId: tenantUsers.tenantId, role: tenantUsers.role })
    .from(tenantUsers)
    .where(eq(tenantUsers.userId, userId))
    .limit(1);
  if (!membership) throw new Error('User has no tenant membership to impersonate');

  return {
    userId: user.id,
    tenantId: membership.tenantId,
    role: membership.role,
    email: user.email,
  };
}

export interface UserDeletionResult {
  sessions: number;
  authIdentities: number;
  passwordResetTokens: number;
  apiKeys: number;
  memberships: number;
}

/**
 * GDPR Article 17 — permanently delete a login user account and everything that
 * references it, in one transaction. Nullable references (staff review items,
 * uploaded files, approved remediation runs) are detached, not deleted, to
 * preserve those records. Refuses platform admins as a safety guard.
 */
export async function deleteUserAccount(userId: string): Promise<UserDeletionResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error('User not found');
    if (user.role === 'platform_admin') {
      throw new Error('Refusing to delete a platform admin account');
    }

    // Detach nullable references so the delete doesn't violate FKs and the
    // referencing records survive with the actor cleared.
    await tx
      .update(staffReviewItems)
      .set({ assignedToUserId: null })
      .where(eq(staffReviewItems.assignedToUserId, userId));
    await tx
      .update(staffReviewItems)
      .set({ resolvedByUserId: null })
      .where(eq(staffReviewItems.resolvedByUserId, userId));
    await tx
      .update(clinicHistoryFiles)
      .set({ uploadedByUserId: null })
      .where(eq(clinicHistoryFiles.uploadedByUserId, userId));
    await tx
      .update(calendarPhiRemediationRuns)
      .set({ approvedByUserId: null })
      .where(eq(calendarPhiRemediationRuns.approvedByUserId, userId));

    // Hard-delete rows the user owns (not-null FKs).
    const sess = await tx
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning({ id: sessions.id });
    const ids = await tx
      .delete(authIdentities)
      .where(eq(authIdentities.userId, userId))
      .returning({ id: authIdentities.id });
    const prt = await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .returning({ id: passwordResetTokens.id });
    const keys = await tx
      .delete(tenantApiKeys)
      .where(eq(tenantApiKeys.createdBy, userId))
      .returning({ id: tenantApiKeys.id });
    const memberships = await tx
      .delete(tenantUsers)
      .where(eq(tenantUsers.userId, userId))
      .returning({ id: tenantUsers.id });

    await tx.delete(users).where(eq(users.id, userId));

    return {
      sessions: sess.length,
      authIdentities: ids.length,
      passwordResetTokens: prt.length,
      apiKeys: keys.length,
      memberships: memberships.length,
    };
  });
}
