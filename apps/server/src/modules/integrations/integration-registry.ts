import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { integrations } from '../../db/schema.js';
import { cache } from '../../lib/cache.js';
import { generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { IntegrationError, NotFoundError } from '../../lib/errors.js';
import { resolveValidGoogleAccessToken } from './google-calendar.shared.js';
import type { Integration } from './integration.types.js';

export async function upsertIntegration(input: {
  tenantId: string;
  integrationType: string;
  provider: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}): Promise<Integration> {
  const id = generateId();
  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.tenantId, input.tenantId), eq(integrations.integrationType, input.integrationType as never)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        config: input.config,
        credentials: input.credentials ?? existing.credentials,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existing.id))
      .returning();

    await cache.invalidateTenantDomain(input.tenantId, 'integrations');
    return updated;
  }

  const [integration] = await db
    .insert(integrations)
    .values({
      id,
      tenantId: input.tenantId,
      configVersion: 1,
      integrationType: input.integrationType as never,
      provider: input.provider ?? 'unknown',
      config: input.config,
      credentials: input.credentials ?? {},
      status: 'disconnected',
    })
    .returning();

  logger.info({ tenantId: input.tenantId, type: input.integrationType }, 'Integration created');
  return integration;
}

export async function activateIntegration(tenantId: string, integrationId: string): Promise<Integration> {
  const [updated] = await db
    .update(integrations)
    .set({ status: 'active', lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .returning();

  if (!updated) throw new NotFoundError('Integration not found');
  await cache.invalidateTenantDomain(tenantId, 'integrations');
  return updated;
}

export async function getIntegrations(tenantId: string): Promise<Integration[]> {
  return db.select().from(integrations).where(eq(integrations.tenantId, tenantId));
}

export async function deleteIntegration(tenantId: string, integrationId: string): Promise<void> {
  await db
    .delete(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)));

  await cache.invalidateTenantDomain(tenantId, 'integrations');
  logger.info({ tenantId, integrationId }, 'Integration deleted');
}

export async function testIntegration(tenantId: string, integrationId: string): Promise<{ success: boolean; message: string }> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) throw new NotFoundError('Integration not found');

  if (integration.integrationType === 'calendar' && integration.provider === 'google_calendar') {
    const { accessToken } = await resolveValidGoogleAccessToken(integration);
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new IntegrationError('calendar', 'google_calendar', 'Google Calendar connectivity test failed');
    }
  }

  return { success: true, message: 'Integration connectivity test passed' };
}

export async function getActiveGoogleCalendarIntegration(tenantId: string): Promise<Integration | null> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.integrationType, 'calendar'),
        eq(integrations.provider, 'google_calendar'),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);

  return integration ?? null;
}
