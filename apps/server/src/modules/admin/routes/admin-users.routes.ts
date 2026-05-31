import { Router } from 'express';
import { validate } from '../../../middleware/index.js';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import {
  users,
  tenantUsers,
  tenantRegistry,
  clinicProfile,
  tenantConfigVersions,
  pilotPreflightStatus,
} from '../../../db/schema.js';
import { sql, eq, ilike, desc } from 'drizzle-orm';
import { signAccessToken } from '../../../lib/crypto.js';
import { requestPasswordReset } from '../../auth/auth.service.js';
import * as adminActions from '../admin-actions.service.js';

export const adminUsersRouter = Router();

// ─── List users ───────────────────────────────────────────────────────────────

adminUsersRouter.get(
  '/',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      search: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset, search } = req.query as unknown as {
        limit: number;
        offset: number;
        search?: string;
      };

      const conditions = search ? ilike(users.email, `%${search}%`) : undefined;

      const [rows, [{ count }]] = await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            createdAt: users.createdAt,
            tenantId: tenantUsers.tenantId,
            clinicName: tenantRegistry.clinicName,
          })
          .from(users)
          .leftJoin(tenantUsers, eq(users.id, tenantUsers.userId))
          .leftJoin(tenantRegistry, eq(tenantUsers.tenantId, tenantRegistry.id))
          .where(conditions)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(users)
          .where(conditions),
      ]);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get user detail ──────────────────────────────────────────────────────────

adminUsersRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        emailVerified: users.emailVerified,
        mfaEnabled: users.mfaEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [membership] = await db
      .select({
        tenantId: tenantUsers.tenantId,
        tenantRole: tenantUsers.role,
        clinicName: tenantRegistry.clinicName,
        clinicSlug: tenantRegistry.clinicSlug,
        plan: tenantRegistry.plan,
        status: tenantRegistry.status,
        stripeCustomerId: tenantRegistry.stripeCustomerId,
        stripeSubscriptionId: tenantRegistry.stripeSubscriptionId,
        tenantCreatedAt: tenantRegistry.createdAt,
      })
      .from(tenantUsers)
      .innerJoin(tenantRegistry, eq(tenantUsers.tenantId, tenantRegistry.id))
      .where(eq(tenantUsers.userId, id))
      .limit(1);

    let tenant = null;

    if (membership) {
      const { tenantId } = membership;

      const [[profile], [latestConfig], [preflight]] = await Promise.all([
        db
          .select({
            id: clinicProfile.id,
            clinicName: clinicProfile.clinicName,
            legalEntityName: clinicProfile.legalEntityName,
            timezone: clinicProfile.timezone,
            primaryPhone: clinicProfile.primaryPhone,
            supportEmail: clinicProfile.supportEmail,
            address: clinicProfile.address,
            phone: clinicProfile.phone,
            email: clinicProfile.email,
            website: clinicProfile.website,
            businessHours: clinicProfile.businessHours,
            specialties: clinicProfile.specialties,
            staffMembers: clinicProfile.staffMembers,
            description: clinicProfile.description,
            status: clinicProfile.status,
            configVersion: clinicProfile.configVersion,
            updatedAt: clinicProfile.updatedAt,
          })
          .from(clinicProfile)
          .where(eq(clinicProfile.tenantId, tenantId))
          .orderBy(desc(clinicProfile.configVersion))
          .limit(1),
        db
          .select({
            version: tenantConfigVersions.version,
            status: tenantConfigVersions.status,
            completenessScore: tenantConfigVersions.completenessScore,
            publishedAt: tenantConfigVersions.publishedAt,
            createdAt: tenantConfigVersions.createdAt,
          })
          .from(tenantConfigVersions)
          .where(eq(tenantConfigVersions.tenantId, tenantId))
          .orderBy(desc(tenantConfigVersions.version))
          .limit(1),
        db
          .select({
            lastPreflightReady: pilotPreflightStatus.lastPreflightReady,
            lastPreflightCheckedAt: pilotPreflightStatus.lastPreflightCheckedAt,
            lastBlockingIssueCodes: pilotPreflightStatus.lastBlockingIssueCodes,
            lastWarningCodes: pilotPreflightStatus.lastWarningCodes,
            latestCalendarPhiScanAt: pilotPreflightStatus.latestCalendarPhiScanAt,
            latestCalendarPhiTotalEvents: pilotPreflightStatus.latestCalendarPhiTotalEvents,
            latestCalendarPhiRiskyEvents: pilotPreflightStatus.latestCalendarPhiRiskyEvents,
          })
          .from(pilotPreflightStatus)
          .where(eq(pilotPreflightStatus.tenantId, tenantId))
          .limit(1),
      ]);

      tenant = {
        id: tenantId,
        tenantRole: membership.tenantRole,
        clinicName: membership.clinicName,
        clinicSlug: membership.clinicSlug,
        plan: membership.plan,
        status: membership.status,
        stripeCustomerId: membership.stripeCustomerId,
        stripeSubscriptionId: membership.stripeSubscriptionId,
        createdAt: membership.tenantCreatedAt,
        clinicProfile: profile ?? null,
        latestConfigVersion: latestConfig ?? null,
        preflight: preflight ?? null,
      };
    }

    res.json({ ...user, tenant });
  } catch (err) {
    next(err);
  }
});

// ─── Update role ──────────────────────────────────────────────────────────────

adminUsersRouter.patch(
  '/:id/role',
  validate({
    body: z.object({
      tenantId: z.string().uuid(),
      role: z.enum(['owner', 'admin', 'manager', 'viewer']),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.params.id as string;
      const { tenantId, role } = req.body as {
        tenantId: string;
        role: adminActions.AssignableTenantRole;
      };
      await adminActions.updateTenantUserRole(tenantId, userId, role);
      req.audit?.({
        action: 'admin.user_role_changed',
        entityType: 'user',
        entityId: userId,
        afterState: { tenantId, role },
      });
      res.json({ message: 'Role updated', role });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Reset MFA ────────────────────────────────────────────────────────────────

adminUsersRouter.post('/:id/reset-mfa', async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    await adminActions.adminResetMfa(userId);
    req.audit?.({ action: 'admin.user_mfa_reset', entityType: 'user', entityId: userId });
    res.json({ message: 'MFA reset' });
  } catch (err) {
    next(err);
  }
});

// ─── Verify email ─────────────────────────────────────────────────────────────

adminUsersRouter.post('/:id/verify-email', async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    await adminActions.adminVerifyEmail(userId);
    req.audit?.({ action: 'admin.user_email_verified', entityType: 'user', entityId: userId });
    res.json({ message: 'Email verified' });
  } catch (err) {
    next(err);
  }
});

// ─── Revoke sessions ──────────────────────────────────────────────────────────

adminUsersRouter.post('/:id/revoke-sessions', async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    const revoked = await adminActions.revokeUserSessions(userId);
    req.audit?.({
      action: 'admin.user_sessions_revoked',
      entityType: 'user',
      entityId: userId,
      afterState: { revoked },
    });
    res.json({ message: 'Sessions revoked', revoked });
  } catch (err) {
    next(err);
  }
});

// ─── Send password reset ──────────────────────────────────────────────────────

adminUsersRouter.post('/:id/password-reset', async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await requestPasswordReset({ email: user.email });
    req.audit?.({
      action: 'admin.user_password_reset_sent',
      entityType: 'user',
      entityId: userId,
    });
    res.json({ message: 'Password reset email sent' });
  } catch (err) {
    next(err);
  }
});

// ─── Impersonate ──────────────────────────────────────────────────────────────

adminUsersRouter.post('/:id/impersonate', async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    const target = await adminActions.getImpersonationTarget(userId);
    const token = signAccessToken({
      userId: target.userId,
      tenantId: target.tenantId,
      role: target.role,
    });
    req.audit?.({
      action: 'admin.user_impersonated',
      entityType: 'user',
      entityId: userId,
      afterState: { tenantId: target.tenantId, impersonatorId: req.user?.userId },
    });
    res.json({ token, tenantId: target.tenantId, email: target.email });
  } catch (err) {
    next(err);
  }
});

// ─── Delete user ──────────────────────────────────────────────────────────────

adminUsersRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    const result = await adminActions.deleteUserAccount(userId);
    req.audit?.({
      action: 'admin.user_deleted',
      entityType: 'user',
      entityId: userId,
      afterState: { ...result },
    });
    res.json({ message: 'User deleted', ...result });
  } catch (err) {
    next(err);
  }
});
