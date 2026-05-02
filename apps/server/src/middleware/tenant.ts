
import type { Request, Response, NextFunction } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tenantRegistry,
  twilioNumbers,
  tenantActiveConfig,
} from '../db/schema.js';
import {
  TenantNotFoundError,
  TenantSuspendedError,
  TenantArchivedError,
} from '../lib/errors.js';
import { createTenantLogger, logger } from '../lib/logger.js';
import {
  getCachedPhoneMapping,
  cachePhoneMapping,
  tenantCacheGet,
  tenantCacheSet,
} from '../lib/cache.js';
import { generateCorrelationId } from '../lib/crypto.js';
import { features } from '../config/features.js';

const CACHE_TTL_PHONE_MAPPING = 300;
const CACHE_TTL_TENANT_CONFIG = 300;

export interface TenantContext {
  tenantId: string;
  clinicSlug: string;
  status: 'active' | 'suspended' | 'archived';
  activeConfigVersion: number;
  resolvedVia: 'jwt' | 'phone_number' | 'api_key' | 'admin_override';
  correlationId: string;
  requestedAt: string;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

export function tenantFromJwt(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    next(new TenantNotFoundError('jwt', 'jwt'));
    return;
  }

  resolveTenant(req.user.tenantId, 'jwt', req)
    .then(() => next())
    .catch(next);
}

export function tenantFromPhoneNumber(req: Request, _res: Response, next: NextFunction): void {
  const calledNumber = req.body?.Called || req.body?.To;
  if (!calledNumber) {
    next(new TenantNotFoundError('phone_number', 'phone_number'));
    return;
  }

  const normalized = calledNumber.startsWith('+') ? calledNumber : `+${calledNumber}`;

  resolveFromPhoneNumber(normalized, req)
    .then(() => next())
    .catch(next);
}

async function resolveFromPhoneNumber(phoneNumber: string, req: Request): Promise<void> {
  const cachedTenantId = await getCachedPhoneMapping(phoneNumber);
  if (cachedTenantId) {
    logger.trace({ phoneNumber }, 'Phone mapping cache hit');
    return resolveTenant(cachedTenantId, 'phone_number', req);
  }

  const [mapping] = await db
    .select({ tenantId: twilioNumbers.tenantId })
    .from(twilioNumbers)
    .where(
      and(
        eq(twilioNumbers.phoneNumber, phoneNumber),
        eq(twilioNumbers.status, 'active'),
      ),
    )
    .limit(1);

  if (!mapping) {
    throw new TenantNotFoundError(phoneNumber, 'phone_number');
  }

  await cachePhoneMapping(phoneNumber, mapping.tenantId, CACHE_TTL_PHONE_MAPPING);

  return resolveTenant(mapping.tenantId, 'phone_number', req);
}

export function tenantFromApiKey(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    next(new TenantNotFoundError('api_key', 'api_key'));
    return;
  }

  next(new TenantNotFoundError(apiKey, 'api_key'));
}

async function resolveTenant(
  tenantId: string,
  method: TenantContext['resolvedVia'],
  req: Request,
): Promise<void> {
  const correlationId = generateCorrelationId();

  const [tenant] = await db
    .select({
      tenantId: tenantRegistry.id,
      clinicSlug: tenantRegistry.clinicSlug,
      status: tenantRegistry.status,
    })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new TenantNotFoundError(tenantId, method);
  }

  if (tenant.status === 'suspended') {
    throw new TenantSuspendedError(tenantId);
  }
  if (tenant.status === 'archived') {
    throw new TenantArchivedError(tenantId);
  }

  let activeConfigVersion = 0;

  const cachedVersion = await tenantCacheGet<number>(
    tenantId, 'active_config', 'version',
  );

  if (cachedVersion) {
    activeConfigVersion = cachedVersion;
  } else {
    const [activeConfig] = await db
      .select({ activeVersionNumber: tenantActiveConfig.activeVersion })
      .from(tenantActiveConfig)
      .where(eq(tenantActiveConfig.tenantId, tenantId))
      .limit(1);

    if (activeConfig) {
      activeConfigVersion = activeConfig.activeVersionNumber;
      await tenantCacheSet(tenantId, 'active_config', 'version', activeConfigVersion, CACHE_TTL_TENANT_CONFIG);
    }
  }

  if (features.databaseRls) {
    await db.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
  }

  const tenantContext: TenantContext = {
    tenantId: tenant.tenantId,
    clinicSlug: tenant.clinicSlug,
    status: tenant.status,
    activeConfigVersion,
    resolvedVia: method,
    correlationId,
    requestedAt: new Date().toISOString(),
  };

  req.tenantContext = tenantContext;

  const tenantLogger = createTenantLogger(tenantId, correlationId);
  tenantLogger.info(
    { method, configVersion: activeConfigVersion },
    'Tenant resolved successfully',
  );
}

export function requireTenantContext(req: Request): TenantContext {
  if (!req.tenantContext) {
    throw new TenantNotFoundError('unknown', 'unknown');
  }
  return req.tenantContext;
}
