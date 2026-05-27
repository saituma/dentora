export type SchedulingProvider = 'google_calendar' | 'dentally' | 'soe_exact' | 'cs_r4_plus';

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
  | 'vendor_access_required'
  | 'disabled';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export type SourceOfTruth = 'google_calendar' | 'pms' | 'local_ledger';
export type GoogleSyncMode = 'disabled' | 'mirror_busy' | 'mirror_full' | 'fallback_only';

export interface Integration {
  id: string;
  tenantId: string;
  integrationType: string;
  provider: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  isActive: boolean;
  healthStatus?: string;
  lastCheckedAt?: string;
  lastSyncAt?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SchedulingConfig {
  tenantId: string;
  primaryProvider: SchedulingProvider;
  primaryIntegrationId?: string | null;
  fallbackProvider?: SchedulingProvider | null;
  fallbackIntegrationId?: string | null;
  sourceOfTruth: SourceOfTruth;
  googleSyncMode: GoogleSyncMode;
}

export interface UpdateSchedulingConfigRequest {
  primaryProvider?: SchedulingProvider;
  primaryIntegrationId?: string | null;
  fallbackProvider?: SchedulingProvider | null;
  fallbackIntegrationId?: string | null;
  sourceOfTruth?: SourceOfTruth;
  googleSyncMode?: GoogleSyncMode;
}

export interface ProviderDetail {
  provider: SchedulingProvider;
  connectionStatus: IntegrationStatus;
  credentialStatus: VerificationStatus;
  healthStatus: ProviderHealthStatus;
  lastHealthCheck?: string | null;
  schedulingConfig?: SchedulingConfig | null;
  recentEvents: IntegrationLogEvent[];
}

export interface IntegrationLogEvent {
  id: string;
  provider: SchedulingProvider;
  eventType: string;
  status: IntegrationStatus | VerificationStatus | 'success' | 'failed';
  tenantId: string;
  correlationId?: string | null;
  createdAt: string;
  errorSummary?: string | null;
  durationMs?: number | null;
}

export interface DentallyVerificationResult {
  verificationType: string;
  status: 'pass' | 'fail';
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface DentallyVerificationReport {
  tenantId: string;
  integrationId: string;
  checks: Record<string, 'PASS' | 'FAIL' | 'WARNING'>;
  readinessScore: number;
  productionRecommendation:
    | 'NOT READY'
    | 'SANDBOX VERIFIED'
    | 'CONTROLLED PILOT READY'
    | 'PRODUCTION READY';
  productionBlockers: string[];
  generatedAt: string;
}

export interface VendorReadinessChecklistItem {
  id: string;
  label: string;
  status: 'unknown' | 'requested' | 'available' | 'blocked' | 'approved';
}

export interface VendorReadinessChecklist {
  provider: Extract<SchedulingProvider, 'soe_exact' | 'cs_r4_plus'>;
  items: VendorReadinessChecklistItem[];
}

export interface IntegrationLogFilters {
  provider?: SchedulingProvider | 'all';
  status?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
}
