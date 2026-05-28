import { z } from 'zod';
import {
  GOOGLE_SYNC_MODES,
  SCHEDULING_PROVIDERS,
  SCHEDULING_SOURCE_OF_TRUTH_VALUES,
  type GoogleSyncMode,
  type SchedulingProviderKey,
  type SchedulingSourceOfTruth,
} from './domain/appointment.types.js';

export const providerParamSchema = z.object({
  provider: z.enum(SCHEDULING_PROVIDERS),
});

export const schedulingConfigUpdateSchema = z.object({
  primaryProvider: z.enum(SCHEDULING_PROVIDERS).optional(),
  primaryIntegrationId: z.string().uuid().nullable().optional(),
  fallbackProvider: z.enum(SCHEDULING_PROVIDERS).nullable().optional(),
  fallbackIntegrationId: z.string().uuid().nullable().optional(),
  sourceOfTruth: z.enum(SCHEDULING_SOURCE_OF_TRUTH_VALUES).optional(),
  googleSyncMode: z.enum(GOOGLE_SYNC_MODES).optional(),
});

export const integrationEventsFilterSchema = z.object({
  provider: z.enum(SCHEDULING_PROVIDERS).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  eventType: z.string().trim().min(1).max(128).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

const readinessNoteSchema = z.object({
  id: z.string().trim().min(1).max(80),
  status: z.enum(['unknown', 'requested', 'available', 'blocked', 'approved']),
  note: z.string().trim().max(1_000).optional(),
  evidenceUrl: z.string().trim().url().max(2_000).optional(),
});

export const providerConfigureBodySchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  vendorNotes: z.string().trim().max(10_000).optional(),
  readinessChecklist: z.array(readinessNoteSchema).max(20).optional(),
});

export type SchedulingConfigUpdateInput = z.infer<typeof schedulingConfigUpdateSchema>;
export type IntegrationEventsFilterInput = z.infer<typeof integrationEventsFilterSchema>;
export type ProviderConfigureInput = z.infer<typeof providerConfigureBodySchema>;

export type IntegrationStatus =
  | 'connected'
  | 'disconnected'
  | 'verification_required'
  | 'sandbox_verified'
  | 'controlled_pilot_ready'
  | 'vendor_access_required'
  | 'disabled'
  | 'error';

export type VerificationStatus =
  | 'not_started'
  | 'pending'
  | 'pass'
  | 'fail'
  | 'warning'
  | 'sandbox_verified'
  | 'controlled_pilot_ready'
  | 'verification_required'
  | 'vendor_access_required'
  | 'disabled';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProviderOverview {
  provider: SchedulingProviderKey;
  displayName: string;
  status: IntegrationStatus;
  featureFlagEnabled: boolean;
  configured: boolean;
  verificationStatus: VerificationStatus;
  readinessScore: number;
  sourceOfTruth: SchedulingSourceOfTruth | null;
  lastHealthCheckAt: string | null;
  warnings: string[];
}

export interface ReadinessChecklistItem {
  id: string;
  label: string;
  status: 'unknown' | 'requested' | 'available' | 'blocked' | 'approved';
  note?: string;
  evidenceUrl?: string;
}

export interface SafeProviderAction {
  id: 'connect' | 'configure' | 'run_verification' | 'view_logs' | 'disconnect';
  label: string;
  enabled: boolean;
  warning?: string;
}

export interface IntegrationEventLogItem {
  id: string;
  provider: SchedulingProviderKey;
  eventType: string;
  status: string;
  tenantId: string;
  integrationId: string | null;
  correlationId: string | null;
  durationMs: number | null;
  errorSummary: string | null;
  createdAt: string;
}

export interface ProviderDetail {
  provider: SchedulingProviderKey;
  displayName: string;
  connectionStatus: IntegrationStatus;
  credentialStatus: VerificationStatus;
  healthStatus: ProviderHealthStatus;
  schedulingConfig: {
    tenantId: string;
    primaryProvider: SchedulingProviderKey;
    primaryIntegrationId: string;
    fallbackProvider: SchedulingProviderKey | null;
    fallbackIntegrationId: string | null;
    sourceOfTruth: SchedulingSourceOfTruth;
    googleSyncMode: GoogleSyncMode;
  } | null;
  readinessChecklist: ReadinessChecklistItem[];
  recentVerificationRuns: IntegrationEventLogItem[];
  recentEvents: IntegrationEventLogItem[];
  safeActions: SafeProviderAction[];
  warnings: string[];
}

export interface VendorAccessPacket {
  provider: Extract<SchedulingProviderKey, 'soe_exact' | 'cs_r4_plus'>;
  displayName: string;
  status: 'vendor_access_required';
  subject: string;
  emailBody: string;
  requiredEvidence: string[];
  acceptanceGate: string[];
  readinessChecklist: ReadinessChecklistItem[];
  generatedAt: string;
}
