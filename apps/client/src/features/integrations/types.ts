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
