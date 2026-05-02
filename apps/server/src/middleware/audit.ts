
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';
import { logger } from '../lib/logger.js';

interface AuditEntry {
  tenantId: string | null;
  actorId: string;
  actorType: 'user' | 'admin' | 'system' | 'integration';
  action: string;
  entityType: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      actorType: entry.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    logger.error({ err: error, entry }, 'Failed to write audit log');
  }
}

export function auditMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { audit: typeof auditFn }).audit = auditFn;

  function auditFn(entry: Omit<AuditEntry, 'tenantId' | 'actorId' | 'actorType' | 'metadata'>) {
    const tenantId = req.tenantContext?.tenantId ?? null;
    const actorId = req.user?.userId ?? 'system';
    const actorType = req.user?.role === 'platform_admin' ? 'admin' as const : 'user' as const;

    writeAuditLog({
      ...entry,
      tenantId,
      actorId,
      actorType,
      metadata: {
        correlationId: req.tenantContext?.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        path: req.path,
      },
    });
  }

  next();
}

declare global {
  namespace Express {
    interface Request {
      audit?: (entry: Omit<AuditEntry, 'tenantId' | 'actorId' | 'actorType' | 'metadata'>) => void;
    }
  }
}
