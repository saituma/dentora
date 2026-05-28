import { desc, eq, and } from 'drizzle-orm';
import { env } from '../../../config/env.js';
import { db } from '../../../db/index.js';
import { dentallyVerificationRuns, integrations } from '../../../db/schema.js';
import { assertTenantAccess } from '../../../db/tenant-context.js';
import type { Integration } from '../../integrations/integration.types.js';
import {
  SCHEDULING_PROVIDERS,
  type SchedulingProviderKey,
  type SchedulingSourceOfTruth,
} from '../domain/appointment.types.js';
import {
  evaluateVendorProductionReadiness,
  isVendorShellProvider,
  type VendorReadinessInputItem,
  type VendorReadinessInputStatus,
} from '../adapters/vendor-readiness.js';
import type {
  IntegrationStatus,
  ProviderHealthStatus,
  ProviderOverview,
  VerificationStatus,
} from '../pms-dashboard.types.js';
import { getTenantSchedulingConfig } from './tenant-scheduling-config.service.js';

export const PROVIDER_DISPLAY_NAMES: Record<SchedulingProviderKey, string> = {
  google_calendar: 'Google Calendar',
  dentally: 'Dentally',
  soe_exact: 'SOE / EXACT',
  cs_r4_plus: 'CS R4+',
};

function featureFlagEnabled(provider: SchedulingProviderKey): boolean {
  if (provider === 'dentally') return env.ENABLE_DENTALLY || process.env.ENABLE_DENTALLY === 'true';
  if (provider === 'soe_exact') {
    return env.ENABLE_SOE_EXACT || process.env.ENABLE_SOE_EXACT === 'true';
  }
  if (provider === 'cs_r4_plus') {
    return env.ENABLE_CS_R4_PLUS || process.env.ENABLE_CS_R4_PLUS === 'true';
  }
  return true;
}

function healthStatus(value: Integration['healthStatus'] | undefined): ProviderHealthStatus {
  if (value === 'healthy') return 'healthy';
  if (value === 'degraded') return 'degraded';
  if (value === 'failing') return 'unhealthy';
  return 'unknown';
}

function sourceOfTruthForProvider(
  sourceOfTruth: SchedulingSourceOfTruth | null,
  provider: SchedulingProviderKey,
): SchedulingSourceOfTruth | null {
  if (provider === 'google_calendar' && sourceOfTruth === 'google_calendar') return sourceOfTruth;
  if (provider !== 'google_calendar' && sourceOfTruth === 'pms') return sourceOfTruth;
  return sourceOfTruth;
}

function integrationForProvider(
  rows: Integration[],
  provider: SchedulingProviderKey,
): Integration | undefined {
  const allowedTypes =
    provider === 'google_calendar' ? ['calendar', 'scheduling'] : ['pms', 'scheduling'];
  return rows.find(
    (item) => item.provider === provider && allowedTypes.includes(item.integrationType),
  );
}

function readinessChecklistFromIntegration(integration?: Integration): VendorReadinessInputItem[] {
  const config = integration?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const checklist = (config as Record<string, unknown>).readinessChecklist;
  if (!Array.isArray(checklist)) return [];
  return checklist
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    )
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

function scoreFromRuns(rows: (typeof dentallyVerificationRuns.$inferSelect)[]): number {
  const latest = new Map<string, string>();
  for (const row of rows) {
    if (!latest.has(row.verificationType)) latest.set(row.verificationType, row.status);
  }
  if (latest.size === 0) return 0;
  return Math.round(([...latest.values()].filter((status) => status === 'pass').length / 8) * 100);
}

function dentallyVerificationStatus(score: number): VerificationStatus {
  if (score >= 90) return 'controlled_pilot_ready';
  if (score >= 75) return 'sandbox_verified';
  return 'verification_required';
}

function statusForProvider(input: {
  provider: SchedulingProviderKey;
  integration?: Integration;
  readinessScore: number;
}): IntegrationStatus {
  if (isVendorShellProvider(input.provider)) {
    return 'vendor_access_required';
  }
  if (input.provider === 'dentally') {
    if (input.readinessScore >= 90) return 'controlled_pilot_ready';
    if (input.readinessScore >= 75) return 'sandbox_verified';
    return 'verification_required';
  }
  if (input.integration?.status === 'active') return 'connected';
  if (input.integration?.status === 'error') return 'error';
  return 'disconnected';
}

function warningsForProvider(input: {
  provider: SchedulingProviderKey;
  featureFlagEnabled: boolean;
  status: IntegrationStatus;
  integration?: Integration;
}): string[] {
  if (input.provider === 'dentally') {
    return [
      ...(input.featureFlagEnabled ? [] : ['Dentally feature flag is disabled.']),
      ...(input.status === 'controlled_pilot_ready'
        ? []
        : ['Dentally is not production ready until real sandbox verification passes.']),
    ];
  }
  if (isVendorShellProvider(input.provider)) {
    const readiness = evaluateVendorProductionReadiness({
      provider: input.provider,
      readinessChecklist: readinessChecklistFromIntegration(input.integration),
    });
    return [
      'Vendor access is required before production integration work can begin.',
      'This provider is not production enabled.',
      readiness.readyForImplementation
        ? 'Vendor discovery is approved; implement the live adapter behind a separate production gate.'
        : `${readiness.missingChecks.length} production readiness checks remain open.`,
    ];
  }
  return [];
}

export async function getPmsProviderOverview(tenantId: string): Promise<ProviderOverview[]> {
  assertTenantAccess(tenantId);
  const [config, integrationRows, dentallyRuns] = await Promise.all([
    getTenantSchedulingConfig(tenantId),
    db.select().from(integrations).where(eq(integrations.tenantId, tenantId)).limit(100),
    db
      .select()
      .from(dentallyVerificationRuns)
      .where(eq(dentallyVerificationRuns.tenantId, tenantId))
      .orderBy(desc(dentallyVerificationRuns.createdAt))
      .limit(100),
  ]);
  const dentallyScore = scoreFromRuns(dentallyRuns);

  return SCHEDULING_PROVIDERS.map((provider) => {
    const integration = integrationForProvider(integrationRows, provider);
    const enabled = featureFlagEnabled(provider);
    const readinessScore = isVendorShellProvider(provider)
      ? evaluateVendorProductionReadiness({
          provider,
          readinessChecklist: readinessChecklistFromIntegration(integration),
        }).score
      : provider === 'dentally'
        ? dentallyScore
        : 0;
    const status = statusForProvider({ provider, integration, readinessScore });
    const verificationStatus: VerificationStatus =
      provider === 'dentally'
        ? dentallyVerificationStatus(readinessScore)
        : isVendorShellProvider(provider)
          ? 'vendor_access_required'
          : integration?.status === 'active'
            ? 'pass'
            : 'not_started';

    return {
      provider,
      displayName: PROVIDER_DISPLAY_NAMES[provider],
      status,
      featureFlagEnabled: enabled,
      configured: Boolean(integration),
      verificationStatus,
      readinessScore,
      sourceOfTruth: sourceOfTruthForProvider(config?.sourceOfTruth ?? null, provider),
      lastHealthCheckAt: integration?.lastSyncAt?.toISOString() ?? null,
      warnings: warningsForProvider({ provider, featureFlagEnabled: enabled, status, integration }),
    };
  });
}

export async function getProviderIntegration(input: {
  tenantId: string;
  provider: SchedulingProviderKey;
}): Promise<Integration | null> {
  assertTenantAccess(input.tenantId);
  const type = input.provider === 'google_calendar' ? 'calendar' : 'pms';
  const fallbackType = input.provider === 'google_calendar' ? 'scheduling' : 'scheduling';
  const [primary] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, input.tenantId),
        eq(integrations.provider, input.provider),
        eq(integrations.integrationType, type),
      ),
    )
    .limit(1);
  if (primary) return primary;
  const [fallback] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, input.tenantId),
        eq(integrations.provider, input.provider),
        eq(integrations.integrationType, fallbackType),
      ),
    )
    .limit(1);
  return fallback ?? null;
}

export function providerFeatureFlagEnabled(provider: SchedulingProviderKey): boolean {
  return featureFlagEnabled(provider);
}

export function providerHealthStatus(
  value: Integration['healthStatus'] | undefined,
): ProviderHealthStatus {
  return healthStatus(value);
}
