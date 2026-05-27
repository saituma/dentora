import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));
const mockGetIntegrationByIdForTenant = vi.hoisted(() => vi.fn());
const mockGetIntegrationByProvider = vi.hoisted(() => vi.fn());
const mockClientForTenant = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockMetricInc = vi.hoisted(() => vi.fn());
const mockMetricObserve = vi.hoisted(() => vi.fn());
const mockMetricSet = vi.hoisted(() => vi.fn());

vi.mock('../../../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../../integrations/integration-registry.js', () => ({
  getIntegrationByIdForTenant: mockGetIntegrationByIdForTenant,
  getIntegrationByProvider: mockGetIntegrationByProvider,
}));
vi.mock('./dentally.client.js', () => ({
  DentallyClient: {
    forTenant: mockClientForTenant,
  },
}));
vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));
vi.mock('../../../../lib/metrics.js', () => ({
  dentallyReadinessScoreGauge: { set: mockMetricSet },
  dentallyVerificationDuration: { observe: mockMetricObserve },
  dentallyVerificationRunsTotal: { inc: mockMetricInc },
  dentallyWebhookVerificationTotal: { inc: mockMetricInc },
}));

import { runWithTenantContext } from '../../../../db/tenant-context.js';
import { AuthorizationError } from '../../../../lib/errors.js';
import type { Integration } from '../../../integrations/integration.types.js';
import { encryptDentallyCredentialsForStorage } from './dentally.auth.js';
import {
  DentallyVerificationService,
  sanitizeDentallyVerificationMetadata,
} from './dentally-verification.service.js';

interface InsertChain {
  values: Mock;
  returning: Mock;
}

interface SelectChain<T> {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
}

const tenantId = 'tenant-a';
const integrationId = '11111111-1111-4111-8111-111111111111';

function insertChain(id = 'run-a'): InsertChain {
  const chain: InsertChain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue([{ id }]),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function selectChain<T>(rows: T[]): SelectChain<T> {
  const chain: SelectChain<T> = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  return chain;
}

function integrationFixture(overrides: Partial<Integration> = {}): Integration {
  return {
    id: integrationId,
    tenantId,
    configVersion: 1,
    integrationType: 'scheduling',
    provider: 'dentally',
    status: 'active',
    config: {
      baseUrl: 'https://api.sandbox.dentally.co',
      practiceId: 'practice-a',
      practiceName: 'Practice A',
    },
    credentials:
      encryptDentallyCredentialsForStorage({
        accessToken: 'access-token-a',
        refreshToken: 'refresh-token-a',
        accessTokenExpiresAt: '2027-01-01T00:00:00.000Z',
        tokenType: 'Bearer',
        scopes: [
          'appointment:read',
          'appointment:create',
          'appointment:update',
          'patient:read',
          'patient:create',
          'patient:update',
          'practice:read',
          'user:read',
        ],
        practiceId: 'practice-a',
        practiceName: 'Practice A',
        webhookSecret: 'webhook-secret-a',
      }) ?? {},
    capabilities: {},
    lastSyncAt: null,
    healthStatus: 'healthy',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

function clientFixture() {
  return {
    integrationId,
    healthCheck: vi.fn().mockResolvedValue(undefined),
    validateCredentials: vi.fn().mockResolvedValue(undefined),
    getOAuthScopes: vi
      .fn()
      .mockResolvedValue([
        'appointment:read',
        'appointment:create',
        'appointment:update',
        'patient:read',
        'patient:create',
        'patient:update',
        'practice:read',
        'user:read',
      ]),
    listPatientsByPhone: vi.fn().mockResolvedValue([]),
    listAppointments: vi.fn().mockResolvedValue([{ id: 'appointment-a' }]),
    createAppointment: vi.fn().mockResolvedValue({ id: 'appointment-created-a' }),
    cancelAppointment: vi.fn().mockResolvedValue(undefined),
  };
}

async function withTenant<T>(currentTenantId: string, callback: () => Promise<T>): Promise<T> {
  return await runWithTenantContext({ tenantId: currentTenantId, source: 'test' }, callback);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_DENTALLY = 'true';
  process.env.DENTALLY_SANDBOX_MODE = 'true';
  process.env.DENTALLY_VERIFICATION_ENABLED = 'false';
  process.env.DENTALLY_ALLOW_SANDBOX_WRITES = 'false';
  process.env.DENTALLY_CONTROLLED_PILOT = 'false';
  delete process.env.DENTALLY_PILOT_TENANT_IDS;
  delete process.env.DENTALLY_PILOT_INTEGRATION_IDS;
  process.env.NODE_ENV = 'development';
  mockGetIntegrationByIdForTenant.mockResolvedValue(integrationFixture());
  mockGetIntegrationByProvider.mockResolvedValue(integrationFixture());
  mockClientForTenant.mockResolvedValue(clientFixture());
  mockDb.insert.mockReturnValue(insertChain());
});

describe('DentallyVerificationService', () => {
  it('runs connectivity verification and stores only safe metadata', async () => {
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyConnectivity({ tenantId, integrationId, correlationId: 'correlation-a' }),
    );

    expect(result).toMatchObject({
      runId: 'run-a',
      verificationType: 'connectivity',
      status: 'pass',
      responseMetadata: { connectivity: 'healthy' },
    });
    expect(mockClientForTenant).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, integrationId, correlationId: 'correlation-a' }),
    );
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    const insert = mockDb.insert.mock.results[0]?.value as InsertChain;
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        integrationId,
        verificationType: 'connectivity',
        status: 'pass',
      }),
    );
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationRunId: 'run-a',
        verificationType: 'connectivity',
        status: 'pass',
      }),
    );
    expect(mockMetricInc).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        verification_type: 'connectivity',
        status: 'pass',
      }),
    );
    expect(mockMetricObserve).toHaveBeenCalled();
  });

  it('keeps appointment create verification in dry-run mode without vendor mutation', async () => {
    const client = clientFixture();
    mockClientForTenant.mockResolvedValueOnce(client);
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyAppointmentCreateDryRun({
        tenantId,
        integrationId,
        executeVendorWrite: false,
        patientId: 'patient-a',
      }),
    );

    expect(client.createAppointment).not.toHaveBeenCalled();
    expect(result.status).toBe('pass');
    expect(result.requestMetadata).toMatchObject({
      dryRun: true,
      safetyReason: 'request_did_not_opt_in',
      writeMode: 'dry_run',
    });
    expect(result.responseMetadata).toMatchObject({
      simulated: true,
      executedVendorWrite: false,
      payloadValid: true,
    });
  });

  it('fails closed when a vendor create write is requested without live sandbox mode', async () => {
    const client = clientFixture();
    mockClientForTenant.mockResolvedValueOnce(client);
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyAppointmentCreateDryRun({
        tenantId,
        integrationId,
        executeVendorWrite: true,
        patientId: 'patient-a',
      }),
    );

    expect(client.createAppointment).not.toHaveBeenCalled();
    expect(result.status).toBe('fail');
    expect(result.errorCode).toBe('dentally_sandbox_mode_enabled');
  });

  it('blocks production-base vendor cancel writes even when requested', async () => {
    const client = clientFixture();
    mockGetIntegrationByIdForTenant.mockResolvedValueOnce(
      integrationFixture({
        config: {
          baseUrl: 'https://api.dentally.co',
          practiceId: 'practice-a',
          practiceName: 'Practice A',
        },
      }),
    );
    process.env.DENTALLY_SANDBOX_MODE = 'false';
    process.env.DENTALLY_ALLOW_SANDBOX_WRITES = 'true';
    process.env.DENTALLY_VERIFICATION_ENABLED = 'true';
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyAppointmentCancelDryRun({
        tenantId,
        integrationId,
        executeVendorWrite: true,
        appointmentId: 'appointment-a',
      }),
    );

    expect(client.cancelAppointment).not.toHaveBeenCalled();
    expect(result.status).toBe('fail');
    expect(result.errorCode).toBe('dentally_production_url_blocked');
  });

  it('executes create only when explicit live sandbox write mode is enabled', async () => {
    const client = clientFixture();
    mockClientForTenant.mockResolvedValueOnce(client);
    process.env.DENTALLY_SANDBOX_MODE = 'false';
    process.env.DENTALLY_ALLOW_SANDBOX_WRITES = 'true';
    process.env.DENTALLY_VERIFICATION_ENABLED = 'true';
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyAppointmentCreateDryRun({
        tenantId,
        integrationId,
        executeVendorWrite: true,
        patientId: 'patient-a',
      }),
    );

    expect(client.createAppointment).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('pass');
    expect(result.responseMetadata).toMatchObject({
      executedVendorWrite: true,
      writeMode: 'live_vendor_write',
      liveMode: true,
    });
  });

  it('fails closed when controlled pilot allowlists exclude the tenant', async () => {
    process.env.DENTALLY_CONTROLLED_PILOT = 'true';
    process.env.DENTALLY_PILOT_TENANT_IDS = '22222222-2222-4222-8222-222222222222';
    process.env.DENTALLY_PILOT_INTEGRATION_IDS = integrationId;
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyConnectivity({ tenantId, integrationId }),
    );

    expect(result.status).toBe('fail');
    expect(result.errorCode).toBe('dentally_pilot_tenant_not_allowed');
    expect(mockClientForTenant).not.toHaveBeenCalled();
  });

  it('redacts PHI and secrets from metadata and structured logs', async () => {
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyPatientLookup({
        tenantId,
        integrationId,
        phoneNumber: '+15551234567',
        correlationId: 'correlation-a',
      }),
    );

    const serializedResult = JSON.stringify(result);
    const serializedLogs = JSON.stringify(mockLoggerInfo.mock.calls);
    expect(serializedResult).not.toContain('+15551234567');
    expect(serializedLogs).not.toContain('+15551234567');
    expect(result.requestMetadata).toMatchObject({ phoneNumberProvided: true });
  });

  it('validates webhook signature, timestamp skew, and replay hash stability', async () => {
    const service = new DentallyVerificationService();

    const result = await withTenant(tenantId, () =>
      service.verifyWebhookDelivery({ tenantId, integrationId }),
    );

    expect(result.status).toBe('pass');
    expect(result.responseMetadata).toMatchObject({
      signatureValid: true,
      payloadValid: true,
      staleTimestampRejected: true,
      replayIdempotencyStable: true,
    });
  });

  it('enforces tenant isolation before verification side effects', async () => {
    const service = new DentallyVerificationService();

    await expect(
      withTenant('tenant-b', () => service.verifyConnectivity({ tenantId, integrationId })),
    ).rejects.toThrow(AuthorizationError);

    expect(mockClientForTenant).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('generates report recommendations from latest safe verification runs', async () => {
    const service = new DentallyVerificationService();
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 'run-connectivity',
          tenantId,
          integrationId,
          verificationType: 'connectivity',
          status: 'pass',
          requestMetadata: {},
          responseMetadata: {},
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        {
          id: 'run-create',
          tenantId,
          integrationId,
          verificationType: 'appointment_create',
          status: 'pass',
          requestMetadata: {},
          responseMetadata: { executedVendorWrite: false, simulated: true },
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]),
    );

    const report = await withTenant(tenantId, () =>
      service.generateVerificationReport({ tenantId, integrationId }),
    );

    expect(report.checks.connectivity).toBe('PASS');
    expect(report.checks.auth).toBe('FAIL');
    expect(report.checks.appointmentCreate).toBe('WARNING');
    expect(report.checks.sandboxSafetyChecks).toBe('PASS');
    expect(report.productionRecommendation).toBe('NOT READY');
    expect(report.productionBlockers).toContain(
      'Appointment create/cancel has not both executed against Dentally sandbox',
    );
    expect(mockMetricSet).toHaveBeenCalledWith(
      {
        tenant_id: tenantId,
        recommendation: 'NOT READY',
      },
      report.readinessScore,
    );
  });

  it('redacts known secret and PHI fields recursively', () => {
    expect(
      sanitizeDentallyVerificationMetadata({
        accessToken: 'secret-token',
        nested: {
          phoneNumber: '+15551234567',
          note: 'email jane@example.com dob 1990-01-01',
        },
      }),
    ).toEqual({
      accessToken: '[redacted]',
      nested: {
        phoneNumber: '[redacted]',
        note: 'email [redacted] dob [redacted]',
      },
    });
  });
});
