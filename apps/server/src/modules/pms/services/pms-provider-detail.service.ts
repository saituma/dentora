import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { dentallyVerificationRuns, integrations } from '../../../db/schema.js';
import { assertTenantAccess } from '../../../db/tenant-context.js';
import { encrypt } from '../../../lib/encryption.js';
import { NotFoundError, ValidationError } from '../../../lib/errors.js';
import { cache } from '../../../lib/cache.js';
import { upsertIntegration } from '../../integrations/integration-registry.js';
import type { Integration } from '../../integrations/integration.types.js';
import {
  csR4PlusReadinessChecklist,
  defaultCsR4PlusConfig,
} from '../adapters/cs-r4-plus/cs-r4-plus.config.js';
import {
  evaluateVendorProductionReadiness,
  isVendorShellProvider,
  vendorProductionReadinessChecklistLabels,
  type VendorReadinessInputItem,
  type VendorReadinessInputStatus,
} from '../adapters/vendor-readiness.js';
import {
  defaultSoeExactConfig,
  soeExactReadinessChecklist,
} from '../adapters/soe-exact/soe-exact.config.js';
import type { SchedulingProviderKey } from '../domain/appointment.types.js';
import type {
  IntegrationEventLogItem,
  IntegrationStatus,
  ProviderConfigureInput,
  ProviderDetail,
  ReadinessChecklistItem,
  SafeProviderAction,
  VerificationStatus,
} from '../pms-dashboard.types.js';
import { listPmsIntegrationEvents } from './pms-integration-events.service.js';
import {
  getProviderIntegration,
  PROVIDER_DISPLAY_NAMES,
  providerFeatureFlagEnabled,
  providerHealthStatus,
} from './pms-provider-overview.service.js';
import { getTenantSchedulingConfig } from './tenant-scheduling-config.service.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function encryptedCredentials(
  credentials: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!credentials) return {};
  const encrypted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === 'string' && value.trim()) {
      encrypted[`encrypted${key.charAt(0).toUpperCase()}${key.slice(1)}`] = encrypt(value);
    } else if (Array.isArray(value) || typeof value === 'number' || typeof value === 'boolean') {
      encrypted[key] = value;
    }
  }
  return encrypted;
}

function safeConfig(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (lower.includes('secret') || lower.includes('token') || lower.includes('password')) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      output[key] = value;
    }
  }
  return output;
}

function checklistFromConfig(
  provider: SchedulingProviderKey,
  integration: Integration | null,
): ReadinessChecklistItem[] {
  type ChecklistStatus = ReadinessChecklistItem['status'];
  const config = isRecord(integration?.config) ? integration.config : {};
  const stored = Array.isArray(config.readinessChecklist) ? config.readinessChecklist : [];
  const storedById = new Map(
    stored.filter(isRecord).map((item) => [
      typeof item.id === 'string' ? item.id : '',
      {
        status:
          item.status === 'requested' ||
          item.status === 'available' ||
          item.status === 'blocked' ||
          item.status === 'approved'
            ? item.status
            : ('unknown' as ChecklistStatus),
        note: typeof item.note === 'string' ? item.note : undefined,
        evidenceUrl: typeof item.evidenceUrl === 'string' ? item.evidenceUrl : undefined,
      },
    ]),
  );
  const vendorChecklist =
    provider === 'soe_exact'
      ? soeExactReadinessChecklist
      : provider === 'cs_r4_plus'
        ? csR4PlusReadinessChecklist
        : [];
  if (vendorChecklist.length > 0) {
    const checklist: ReadinessChecklistItem[] = vendorChecklist.map((item) => {
      const storedItem = storedById.get(item.id);
      return {
        id: item.id,
        label: item.question,
        status: storedItem?.status ?? 'unknown',
        note: storedItem?.note,
        evidenceUrl: storedItem?.evidenceUrl,
      };
    });
    for (const item of vendorProductionReadinessChecklistLabels()) {
      if (checklist.some((existing) => existing.id === item.id)) continue;
      const storedItem = storedById.get(item.id);
      checklist.push({
        id: item.id,
        label: item.label,
        status: storedItem?.status ?? 'unknown',
        note: storedItem?.note,
        evidenceUrl: storedItem?.evidenceUrl,
      });
    }
    return checklist;
  }
  if (provider === 'dentally') {
    return [
      { id: 'connectivity', label: 'Connectivity verified', status: 'unknown' },
      { id: 'credentials', label: 'Credentials verified', status: 'unknown' },
      { id: 'scopes', label: 'OAuth scopes verified', status: 'unknown' },
      { id: 'patient_lookup', label: 'Patient lookup verified', status: 'unknown' },
      { id: 'appointment_read', label: 'Appointment read verified', status: 'unknown' },
      { id: 'appointment_create', label: 'Appointment create dry-run verified', status: 'unknown' },
      { id: 'appointment_cancel', label: 'Appointment cancel dry-run verified', status: 'unknown' },
      { id: 'webhook', label: 'Webhook verification passed', status: 'unknown' },
    ];
  }
  return [];
}

function actionsForProvider(
  provider: SchedulingProviderKey,
  integration: Integration | null,
): SafeProviderAction[] {
  const vendorShell = isVendorShellProvider(provider);
  return [
    {
      id: 'connect',
      label: 'Connect',
      enabled: provider === 'google_calendar' && !integration,
      warning: vendorShell ? 'Vendor access required before connect can be enabled.' : undefined,
    },
    { id: 'configure', label: 'Configure', enabled: true },
    {
      id: 'run_verification',
      label: 'Run verification',
      enabled: provider === 'dentally',
      warning:
        provider === 'dentally' ? undefined : 'Verification is not available for this provider.',
    },
    { id: 'view_logs', label: 'View logs', enabled: true },
    { id: 'disconnect', label: 'Disconnect', enabled: Boolean(integration) },
  ];
}

function statusForProvider(
  provider: SchedulingProviderKey,
  integration: Integration | null,
): IntegrationStatus {
  if (isVendorShellProvider(provider)) return 'vendor_access_required';
  if (provider === 'dentally') return 'verification_required';
  if (integration?.status === 'active') return 'connected';
  if (integration?.status === 'error') return 'error';
  return 'disconnected';
}

function credentialStatus(
  provider: SchedulingProviderKey,
  integration: Integration | null,
): VerificationStatus {
  if (isVendorShellProvider(provider)) return 'vendor_access_required';
  if (!integration) return 'not_started';
  if (provider === 'dentally') return 'verification_required';
  return integration.status === 'active' ? 'pass' : 'not_started';
}

function storedReadinessItems(integration: Integration | null): VendorReadinessInputItem[] {
  const config = isRecord(integration?.config) ? integration?.config : {};
  const stored = Array.isArray(config.readinessChecklist) ? config.readinessChecklist : [];
  return stored
    .filter(isRecord)
    .map((item): VendorReadinessInputItem => {
      const status: VendorReadinessInputStatus =
        item.status === 'requested' ||
        item.status === 'available' ||
        item.status === 'blocked' ||
        item.status === 'approved'
          ? item.status
          : 'unknown';
      return {
        id: typeof item.id === 'string' ? item.id : '',
        status,
        note: typeof item.note === 'string' ? item.note : undefined,
        evidenceUrl: typeof item.evidenceUrl === 'string' ? item.evidenceUrl : undefined,
      };
    })
    .filter((item) => item.id);
}

function warningsForProvider(
  provider: SchedulingProviderKey,
  integration: Integration | null,
): string[] {
  if (provider === 'dentally') {
    return [
      'Dentally is not production ready until real sandbox verification passes.',
      'Do not enable Dentally for live clinics unless controlled pilot ready.',
    ];
  }
  if (isVendorShellProvider(provider)) {
    const readiness = evaluateVendorProductionReadiness({
      provider,
      readinessChecklist: storedReadinessItems(integration),
    });
    return [
      'Vendor access required.',
      'Not production enabled.',
      readiness.readyForImplementation
        ? 'Discovery is approved; live adapter implementation is still required.'
        : `${readiness.missingChecks.length} production readiness checks remain open.`,
      ...(provider === 'cs_r4_plus' ? ['On-prem connector requirements are not confirmed.'] : []),
    ];
  }
  return [];
}

function verificationRunToEvent(
  row: typeof dentallyVerificationRuns.$inferSelect,
): IntegrationEventLogItem {
  return {
    id: row.id,
    provider: 'dentally',
    eventType: `verification.${row.verificationType}`,
    status: row.status,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    correlationId: null,
    durationMs: row.durationMs,
    errorSummary: row.errorMessage?.slice(0, 500) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getPmsProviderDetail(input: {
  tenantId: string;
  provider: SchedulingProviderKey;
}): Promise<ProviderDetail> {
  assertTenantAccess(input.tenantId);
  const [integration, schedulingConfig, recentEventsResult, verificationRows] = await Promise.all([
    getProviderIntegration(input),
    getTenantSchedulingConfig(input.tenantId),
    listPmsIntegrationEvents({
      tenantId: input.tenantId,
      filters: { provider: input.provider, page: 1, perPage: 10 },
    }),
    input.provider === 'dentally'
      ? db
          .select()
          .from(dentallyVerificationRuns)
          .where(eq(dentallyVerificationRuns.tenantId, input.tenantId))
          .orderBy(desc(dentallyVerificationRuns.createdAt))
          .limit(10)
      : Promise.resolve([]),
  ]);

  return {
    provider: input.provider,
    displayName: PROVIDER_DISPLAY_NAMES[input.provider],
    connectionStatus: statusForProvider(input.provider, integration),
    credentialStatus: credentialStatus(input.provider, integration),
    healthStatus: providerHealthStatus(integration?.healthStatus),
    schedulingConfig,
    readinessChecklist: checklistFromConfig(input.provider, integration),
    recentVerificationRuns: verificationRows.map(verificationRunToEvent),
    recentEvents: recentEventsResult.data,
    safeActions: actionsForProvider(input.provider, integration),
    warnings: warningsForProvider(input.provider, integration),
  };
}

export async function configurePmsProvider(input: {
  tenantId: string;
  provider: SchedulingProviderKey;
  body: ProviderConfigureInput;
}): Promise<ProviderDetail> {
  assertTenantAccess(input.tenantId);
  if (input.provider === 'google_calendar') {
    throw new ValidationError('Google Calendar must be connected through OAuth');
  }

  const vendorShell = isVendorShellProvider(input.provider);
  const baseConfig =
    input.provider === 'soe_exact'
      ? defaultSoeExactConfig
      : input.provider === 'cs_r4_plus'
        ? defaultCsR4PlusConfig
        : {};

  const rawReadinessChecklist = input.body.readinessChecklist ?? [];
  const productionReadiness = isVendorShellProvider(input.provider)
    ? evaluateVendorProductionReadiness({
        provider: input.provider,
        readinessChecklist: rawReadinessChecklist,
      })
    : null;

  const integration = await upsertIntegration({
    tenantId: input.tenantId,
    integrationType: 'pms',
    provider: input.provider,
    config: {
      ...baseConfig,
      ...safeConfig(input.body.config),
      vendorNotes: input.body.vendorNotes,
      readinessChecklist: rawReadinessChecklist,
      productionEnabled: false,
      vendorAccessRequired: vendorShell,
      productionReadiness,
      liveImplementationAvailable: false,
      featureFlagEnabled: providerFeatureFlagEnabled(input.provider),
    },
    credentials:
      input.provider === 'dentally'
        ? input.body.credentials
        : encryptedCredentials(input.body.credentials),
  });
  await db
    .update(integrations)
    .set({ status: 'disconnected', updatedAt: new Date() })
    .where(and(eq(integrations.tenantId, input.tenantId), eq(integrations.id, integration.id)));
  await cache.invalidateTenantDomain(input.tenantId, 'integrations');

  return await getPmsProviderDetail({ tenantId: input.tenantId, provider: input.provider });
}

export async function disconnectPmsProvider(input: {
  tenantId: string;
  provider: SchedulingProviderKey;
}): Promise<ProviderDetail> {
  assertTenantAccess(input.tenantId);
  const integration = await getProviderIntegration(input);
  if (!integration) {
    throw new NotFoundError('Provider integration', input.provider);
  }
  await db
    .update(integrations)
    .set({ status: 'disconnected', updatedAt: new Date() })
    .where(and(eq(integrations.id, integration.id), eq(integrations.tenantId, input.tenantId)));
  await cache.invalidateTenantDomain(input.tenantId, 'integrations');
  return await getPmsProviderDetail(input);
}
