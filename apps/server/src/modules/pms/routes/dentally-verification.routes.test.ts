import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mockService = vi.hoisted(() => ({
  verifyConnectivity: vi.fn(),
  verifyCredentials: vi.fn(),
  verifyScopes: vi.fn(),
  verifyPatientLookup: vi.fn(),
  verifyAppointmentRead: vi.fn(),
  verifyAppointmentCreateDryRun: vi.fn(),
  verifyAppointmentCancelDryRun: vi.fn(),
  verifyWebhookDelivery: vi.fn(),
  generateVerificationReport: vi.fn(),
}));
const mockRouteAllowed = vi.hoisted(() => vi.fn());
let currentRole = 'admin';

vi.mock('../adapters/dentally/dentally-verification.service.js', () => ({
  dentallyVerificationService: mockService,
  isDentallyVerificationRouteAllowed: mockRouteAllowed,
}));

vi.mock('../../../middleware/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../middleware/validate.js')>(
    '../../../middleware/validate.js',
  );
  const errors =
    await vi.importActual<typeof import('../../../lib/errors.js')>('../../../lib/errors.js');
  return {
    validate: actual.validate,
    rateLimiter:
      () =>
      (_req: Request, _res: Response, next: NextFunction): void =>
        next(),
    authenticateJwt: (req: Request, _res: Response, next: NextFunction) => {
      req.user = { userId: 'user-a', role: currentRole, tenantId: 'tenant-a' };
      next();
    },
    resolveTenant: (req: Request, _res: Response, next: NextFunction) => {
      req.tenantContext = {
        tenantId: 'tenant-a',
        clinicSlug: 'clinic-a',
        status: 'active',
        activeConfigVersion: 1,
        resolvedVia: 'jwt',
        correlationId: 'correlation-a',
        requestedAt: '2026-06-01T00:00:00.000Z',
      };
      next();
    },
    requireRole:
      (...allowedRoles: string[]) =>
      (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
          next(new errors.AuthorizationError('Role is not allowed'));
          return;
        }
        next();
      },
  };
});

import { AuthorizationError } from '../../../lib/errors.js';
import { dentallyVerificationRouter } from './dentally-verification.routes.js';
import { DentallyFeatureDisabledError } from '../adapters/dentally/dentally.errors.js';

interface RouterResponse {
  statusCode: number;
  body: unknown;
  audit: ReturnType<typeof vi.fn>;
}

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(this: FakeResponse, code: number): FakeResponse;
  json(this: FakeResponse, body: unknown): FakeResponse;
}

function resultFixture(type = 'connectivity') {
  return {
    runId: `run-${type}`,
    verificationType: type,
    status: 'pass',
    requestMetadata: {},
    responseMetadata: {},
    durationMs: 10,
  };
}

async function request(input: {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Promise<RouterResponse> {
  return await new Promise((resolve) => {
    const audit = vi.fn();
    const req = {
      method: input.method,
      url: input.path,
      originalUrl: input.path,
      path: input.path,
      headers: {},
      ip: '127.0.0.1',
      body: input.body ?? {},
      query: input.query ?? {},
      params: {},
      audit,
    } as unknown as Request;

    const res: FakeResponse = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body, audit });
        return this;
      },
    };

    (
      dentallyVerificationRouter as unknown as {
        handle: (req: Request, res: Response, next: NextFunction) => void;
      }
    ).handle(
      req,
      res as unknown as Response,
      ((err?: unknown) => {
        if (err) {
          resolve({ statusCode: 500, body: err, audit });
          return;
        }
        resolve({ statusCode: res.statusCode, body: undefined, audit });
      }) as NextFunction,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentRole = 'admin';
  process.env.ENABLE_DENTALLY = 'true';
  process.env.NODE_ENV = 'development';
  process.env.DENTALLY_CONTROLLED_PILOT = 'false';
  mockRouteAllowed.mockReturnValue(true);
  mockService.verifyConnectivity.mockResolvedValue(resultFixture('connectivity'));
  mockService.verifyCredentials.mockResolvedValue(resultFixture('credentials'));
  mockService.verifyScopes.mockResolvedValue(resultFixture('scopes'));
  mockService.verifyPatientLookup.mockResolvedValue(resultFixture('patient_lookup'));
  mockService.verifyAppointmentRead.mockResolvedValue(resultFixture('appointment_read'));
  mockService.verifyAppointmentCreateDryRun.mockResolvedValue(resultFixture('appointment_create'));
  mockService.verifyAppointmentCancelDryRun.mockResolvedValue(resultFixture('appointment_cancel'));
  mockService.verifyWebhookDelivery.mockResolvedValue(resultFixture('webhook_delivery'));
  mockService.generateVerificationReport.mockResolvedValue({
    tenantId: 'tenant-a',
    integrationId: '11111111-1111-4111-8111-111111111111',
    checks: { connectivity: 'pass' },
    latestRuns: {},
    readinessScore: 6,
    productionRecommendation: 'NOT READY',
    productionBlockers: [],
    generatedAt: '2026-06-01T00:00:00.000Z',
  });
});

describe('Dentally verification routes', () => {
  it('requires admin-like authorization', async () => {
    currentRole = 'viewer';

    const response = await request({ method: 'POST', path: '/connectivity' });

    expect(response.statusCode).toBe(500);
    expect(response.body).toBeInstanceOf(AuthorizationError);
    expect(mockService.verifyConnectivity).not.toHaveBeenCalled();
  });

  it('is protected by the Dentally feature flag', async () => {
    delete process.env.ENABLE_DENTALLY;

    const response = await request({ method: 'POST', path: '/connectivity' });

    expect(response.statusCode).toBe(500);
    expect(response.body).toBeInstanceOf(DentallyFeatureDisabledError);
    expect(mockService.verifyConnectivity).not.toHaveBeenCalled();
  });

  it('runs credentials verification with tenant context and audit logging', async () => {
    const integrationId = '11111111-1111-4111-8111-111111111111';

    const response = await request({
      method: 'POST',
      path: '/credentials',
      body: { integrationId },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.verifyCredentials).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      integrationId,
      correlationId: 'correlation-a',
    });
    expect(response.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dentally.verify.credentials',
        entityType: 'dentally_verification_run',
        entityId: 'run-credentials',
      }),
    );
  });

  it('routes appointment create verification as a dry-run action', async () => {
    const response = await request({
      method: 'POST',
      path: '/appointment-create',
      body: {
        patientId: 'patient-a',
        executeVendorWrite: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.verifyAppointmentCreateDryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        patientId: 'patient-a',
        executeVendorWrite: false,
      }),
    );
    expect(response.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dentally.verify.create_dry_run' }),
    );
  });

  it('audits live sandbox create verification separately from dry-run actions', async () => {
    mockService.verifyAppointmentCreateDryRun.mockResolvedValueOnce({
      ...resultFixture('appointment_create'),
      responseMetadata: { executedVendorWrite: true, writeMode: 'live_vendor_write' },
      requestMetadata: { providerRequestId: 'provider-request-a' },
    });

    const response = await request({
      method: 'POST',
      path: '/appointment-create',
      body: {
        patientId: 'patient-a',
        executeVendorWrite: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dentally.verify.create_live',
        afterState: expect.objectContaining({
          writeMode: 'live_vendor_write',
          providerRequestId: 'provider-request-a',
        }),
      }),
    );
  });

  it('runs webhook verification tooling through the service', async () => {
    const response = await request({
      method: 'POST',
      path: '/webhook',
      body: { rawBody: JSON.stringify({ event_type: 'appointment.created', data: { id: 1 } }) },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.verifyWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        rawBody: JSON.stringify({ event_type: 'appointment.created', data: { id: 1 } }),
      }),
    );
    expect(response.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dentally.verify.webhook' }),
    );
  });

  it('generates the report with a safe audit event', async () => {
    const response = await request({
      method: 'GET',
      path: '/report',
      query: { integrationId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.generateVerificationReport).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      integrationId: '11111111-1111-4111-8111-111111111111',
      correlationId: 'correlation-a',
    });
    expect(response.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dentally.verify.report',
        entityType: 'dentally_verification_run',
        entityId: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });
});
