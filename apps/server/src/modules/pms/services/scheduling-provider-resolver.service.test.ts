import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockGetTenantSchedulingConfig = vi.hoisted(() => vi.fn());

vi.mock('../../integrations/integration-registry.js', () => ({
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
}));

vi.mock('./tenant-scheduling-config.service.js', () => ({
  getTenantSchedulingConfig: mockGetTenantSchedulingConfig,
}));

import {
  resolveActiveSchedulingProvider,
  resolveSchedulingProvider,
} from './scheduling-provider-resolver.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ENABLE_DENTALLY;
  delete process.env.ENABLE_SOE_EXACT;
  delete process.env.ENABLE_CS_R4_PLUS;
  mockGetTenantSchedulingConfig.mockResolvedValue(null);
  mockGetActiveGoogleCalendarIntegration.mockResolvedValue({ id: 'integration-a' });
});

describe('scheduling provider resolver', () => {
  it('returns the current Google Calendar provider without requiring vendor-specific callers', () => {
    const provider = resolveSchedulingProvider({
      tenantId: 'tenant-a',
      providerName: 'google_calendar',
    });

    expect(typeof provider.getAvailability).toBe('function');
    expect(typeof provider.listAppointments).toBe('function');
    expect(typeof provider.findAppointment).toBe('function');
    expect(typeof provider.createAppointment).toBe('function');
    expect(typeof provider.cancelAppointment).toBe('function');
    expect(typeof provider.rescheduleAppointment).toBe('function');
    expect(typeof provider.findPatient).toBe('function');
    expect(typeof provider.upsertPatient).toBe('function');
    expect(typeof provider.validateCredentials).toBe('function');
    expect(typeof provider.healthCheck).toBe('function');
  });

  it('resolves the active scheduling provider and preserves the active integration id', async () => {
    const resolution = await resolveActiveSchedulingProvider('tenant-a');

    expect(mockGetTenantSchedulingConfig).toHaveBeenCalledWith('tenant-a');
    expect(mockGetActiveGoogleCalendarIntegration).toHaveBeenCalledWith('tenant-a');
    expect(resolution.providerName).toBe('google_calendar');
    expect(resolution.integrationId).toBe('integration-a');
    expect(resolution.usedFallback).toBe(false);
    expect(typeof resolution.provider.getAvailability).toBe('function');
    expect(typeof resolution.provider.listAppointments).toBe('function');
    expect(typeof resolution.provider.findAppointment).toBe('function');
    expect(typeof resolution.provider.createAppointment).toBe('function');
    expect(typeof resolution.provider.cancelAppointment).toBe('function');
    expect(typeof resolution.provider.rescheduleAppointment).toBe('function');
    expect(typeof resolution.provider.findPatient).toBe('function');
    expect(typeof resolution.provider.upsertPatient).toBe('function');
    expect(typeof resolution.provider.validateCredentials).toBe('function');
    expect(typeof resolution.provider.healthCheck).toBe('function');
  });

  it('keeps the existing missing-calendar failure message', async () => {
    mockGetActiveGoogleCalendarIntegration.mockResolvedValueOnce(null);

    await expect(resolveActiveSchedulingProvider('tenant-a')).rejects.toThrow(
      'Google Calendar is not connected for this clinic',
    );
  });

  it('uses tenant scheduling config when present', async () => {
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'google_calendar',
      primaryIntegrationId: 'configured-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'local_ledger',
      googleSyncMode: 'fallback_only',
    });

    const resolution = await resolveActiveSchedulingProvider({
      tenantId: 'tenant-a',
      operation: 'write',
    });

    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(resolution.providerName).toBe('google_calendar');
    expect(resolution.integrationId).toBe('configured-integration-a');
    expect(resolution.usedFallback).toBe(false);
  });

  it('rejects SOE/EXACT when the feature flag is disabled', async () => {
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'soe_exact',
      primaryIntegrationId: 'soe-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    await expect(
      resolveActiveSchedulingProvider({ tenantId: 'tenant-a', operation: 'write' }),
    ).rejects.toMatchObject({
      name: 'SoeExactNotConfiguredError',
      provider: 'soe_exact',
    });
  });

  it('rejects CS R4+ when the feature flag is disabled', async () => {
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'cs_r4_plus',
      primaryIntegrationId: 'r4-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    await expect(
      resolveActiveSchedulingProvider({ tenantId: 'tenant-a', operation: 'write' }),
    ).rejects.toMatchObject({
      name: 'CsR4PlusNotConfiguredError',
      provider: 'cs_r4_plus',
    });
  });

  it('enables SOE/EXACT only as a fail-closed shell requiring vendor access', async () => {
    process.env.ENABLE_SOE_EXACT = 'true';
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'soe_exact',
      primaryIntegrationId: 'soe-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    const resolution = await resolveActiveSchedulingProvider({
      tenantId: 'tenant-a',
      operation: 'write',
    });

    expect(resolution.providerName).toBe('soe_exact');
    await expect(resolution.provider.healthCheck()).rejects.toMatchObject({
      name: 'VendorAccessRequiredError',
      provider: 'soe_exact',
    });
  });

  it('enables CS R4+ only as a fail-closed shell requiring vendor access', async () => {
    process.env.ENABLE_CS_R4_PLUS = 'true';
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'cs_r4_plus',
      primaryIntegrationId: 'r4-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    const resolution = await resolveActiveSchedulingProvider({
      tenantId: 'tenant-a',
      operation: 'write',
    });

    expect(resolution.providerName).toBe('cs_r4_plus');
    await expect(resolution.provider.healthCheck()).rejects.toMatchObject({
      name: 'VendorAccessRequiredError',
      provider: 'cs_r4_plus',
    });
  });

  it('resolves Dentally when the feature flag is enabled', async () => {
    process.env.ENABLE_DENTALLY = 'true';
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'dentally',
      primaryIntegrationId: 'dentally-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    const resolution = await resolveActiveSchedulingProvider({
      tenantId: 'tenant-a',
      operation: 'write',
    });

    expect(resolution.providerName).toBe('dentally');
    expect(resolution.integrationId).toBe('dentally-integration-a');
    expect(typeof resolution.provider.createAppointment).toBe('function');
    expect(typeof resolution.provider.upsertPatient).toBe('function');
  });

  it('throws a typed error when Dentally is configured but disabled', async () => {
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'dentally',
      primaryIntegrationId: 'dentally-integration-a',
      fallbackProvider: null,
      fallbackIntegrationId: null,
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    await expect(
      resolveActiveSchedulingProvider({ tenantId: 'tenant-a', operation: 'write' }),
    ).rejects.toMatchObject({
      name: 'DentallyFeatureDisabledError',
      provider: 'dentally',
    });
  });

  it('does not silently fallback for write operations', async () => {
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'soe_exact',
      primaryIntegrationId: 'soe-integration-a',
      fallbackProvider: 'google_calendar',
      fallbackIntegrationId: 'google-integration-a',
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    await expect(
      resolveActiveSchedulingProvider({ tenantId: 'tenant-a', operation: 'write' }),
    ).rejects.toMatchObject({
      name: 'SoeExactNotConfiguredError',
      provider: 'soe_exact',
    });
  });

  it('rejects disabled SOE/EXACT instead of silently falling back for read operations', async () => {
    mockGetTenantSchedulingConfig.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      primaryProvider: 'soe_exact',
      primaryIntegrationId: 'soe-integration-a',
      fallbackProvider: 'google_calendar',
      fallbackIntegrationId: 'google-integration-a',
      sourceOfTruth: 'pms',
      googleSyncMode: 'fallback_only',
    });

    await expect(
      resolveActiveSchedulingProvider({ tenantId: 'tenant-a', operation: 'read' }),
    ).rejects.toMatchObject({
      name: 'SoeExactNotConfiguredError',
      provider: 'soe_exact',
    });
  });
});
