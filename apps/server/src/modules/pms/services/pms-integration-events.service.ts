import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { dentallyVerificationRuns, pmsWebhookEvents } from '../../../db/schema.js';
import { assertTenantAccess } from '../../../db/tenant-context.js';
import type {
  IntegrationEventLogItem,
  IntegrationEventsFilterInput,
} from '../pms-dashboard.types.js';

const REDACTED = '[redacted]';

function redactSummary(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED)
    .replace(/\+?\d[\d\s().-]{6,}\d/g, REDACTED)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, REDACTED)
    .replace(/\b(access|refresh|secret|token|authorization|patient)\b[^,}\]]*/gi, REDACTED)
    .slice(0, 500);
}

function dateOrUndefined(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export async function listPmsIntegrationEvents(input: {
  tenantId: string;
  filters: IntegrationEventsFilterInput;
}): Promise<{ data: IntegrationEventLogItem[]; page: number; perPage: number; total: number }> {
  assertTenantAccess(input.tenantId);
  const page = input.filters.page;
  const perPage = input.filters.perPage;
  const dateFrom = dateOrUndefined(input.filters.dateFrom);
  const dateTo = dateOrUndefined(input.filters.dateTo);

  const verificationConditions: SQL<unknown>[] = [
    eq(dentallyVerificationRuns.tenantId, input.tenantId),
  ];
  if (input.filters.provider && input.filters.provider !== 'dentally') {
    verificationConditions.push(
      eq(dentallyVerificationRuns.integrationId, '00000000-0000-0000-0000-000000000000'),
    );
  }
  if (input.filters.status) {
    verificationConditions.push(eq(dentallyVerificationRuns.status, input.filters.status));
  }
  if (input.filters.eventType) {
    verificationConditions.push(
      eq(dentallyVerificationRuns.verificationType, input.filters.eventType),
    );
  }
  if (dateFrom) verificationConditions.push(gte(dentallyVerificationRuns.createdAt, dateFrom));
  if (dateTo) verificationConditions.push(lte(dentallyVerificationRuns.createdAt, dateTo));

  const webhookConditions: SQL<unknown>[] = [eq(pmsWebhookEvents.tenantId, input.tenantId)];
  if (input.filters.provider) {
    webhookConditions.push(eq(pmsWebhookEvents.provider, input.filters.provider));
  }
  if (input.filters.status) {
    webhookConditions.push(eq(pmsWebhookEvents.status, input.filters.status));
  }
  if (input.filters.eventType) {
    webhookConditions.push(eq(pmsWebhookEvents.eventType, input.filters.eventType));
  }
  if (dateFrom) webhookConditions.push(gte(pmsWebhookEvents.createdAt, dateFrom));
  if (dateTo) webhookConditions.push(lte(pmsWebhookEvents.createdAt, dateTo));

  const [verificationRows, webhookRows] = await Promise.all([
    db
      .select()
      .from(dentallyVerificationRuns)
      .where(and(...verificationConditions))
      .orderBy(desc(dentallyVerificationRuns.createdAt))
      .limit(500),
    db
      .select()
      .from(pmsWebhookEvents)
      .where(and(...webhookConditions))
      .orderBy(desc(pmsWebhookEvents.createdAt))
      .limit(500),
  ]);

  const verificationEvents: IntegrationEventLogItem[] = verificationRows.map((row) => ({
    id: row.id,
    provider: 'dentally',
    eventType: `verification.${row.verificationType}`,
    status: row.status,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    correlationId:
      typeof row.requestMetadata === 'object' &&
      row.requestMetadata !== null &&
      !Array.isArray(row.requestMetadata) &&
      typeof (row.requestMetadata as Record<string, unknown>).providerRequestId === 'string'
        ? ((row.requestMetadata as Record<string, unknown>).providerRequestId as string)
        : null,
    durationMs: row.durationMs,
    errorSummary: redactSummary(row.errorMessage),
    createdAt: row.createdAt.toISOString(),
  }));

  const webhookEvents: IntegrationEventLogItem[] = webhookRows.map((row) => ({
    id: row.id,
    provider: row.provider,
    eventType: row.eventType,
    status: row.status,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    correlationId: row.externalEventId,
    durationMs:
      row.processedAt && row.receivedAt
        ? Math.max(0, row.processedAt.getTime() - row.receivedAt.getTime())
        : null,
    errorSummary: null,
    createdAt: row.createdAt.toISOString(),
  }));

  const sorted = [...verificationEvents, ...webhookEvents].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const offset = (page - 1) * perPage;

  return {
    data: sorted.slice(offset, offset + perPage),
    page,
    perPage,
    total: sorted.length,
  };
}
