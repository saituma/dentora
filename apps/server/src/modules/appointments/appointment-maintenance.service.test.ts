import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, AppointmentHold } from './appointment-ledger.service.js';

const mockListActiveTenantIdsForMaintenance = vi.hoisted(() => vi.fn());
const mockExpireAppointmentHolds = vi.hoisted(() => vi.fn());
const mockFindReconciliationRetryCandidates = vi.hoisted(() => vi.fn());
const mockCancelGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockAcquireDistributedLock = vi.hoisted(() => vi.fn());
const mockFeatures = vi.hoisted(() => ({
  appointmentReconciliationProcessor: false,
}));
const mockProcessAppointmentReconciliationCandidate = vi.hoisted(() => vi.fn());
const mockRecordOperationalHealthStarted = vi.hoisted(() => vi.fn());
const mockRecordOperationalHealthSuccess = vi.hoisted(() => vi.fn());
const mockRecordOperationalHealthFailure = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../tenants/tenant.service.js', () => ({
  listActiveTenantIdsForMaintenance: mockListActiveTenantIdsForMaintenance,
}));

vi.mock('./appointment-ledger.service.js', async () => {
  const actual = await vi.importActual<typeof import('./appointment-ledger.service.js')>(
    './appointment-ledger.service.js',
  );
  return {
    ...actual,
    expireAppointmentHolds: mockExpireAppointmentHolds,
  };
});

vi.mock('./appointment-reconciliation.service.js', () => ({
  findReconciliationRetryCandidates: mockFindReconciliationRetryCandidates,
  processAppointmentReconciliationCandidate: mockProcessAppointmentReconciliationCandidate,
}));

vi.mock('../../config/features.js', () => ({
  features: mockFeatures,
}));

vi.mock('../integrations/google-calendar-appointments.js', () => ({
  cancelGoogleCalendarAppointment: mockCancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment: mockRescheduleGoogleCalendarAppointment,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../lib/distributed-lock.js', () => ({
  acquireDistributedLock: mockAcquireDistributedLock,
}));

vi.mock('../operational-health/operational-health.service.js', () => ({
  APPOINTMENT_MAINTENANCE_COMPONENT: 'appointment_maintenance',
  recordOperationalHealthStarted: mockRecordOperationalHealthStarted,
  recordOperationalHealthSuccess: mockRecordOperationalHealthSuccess,
  recordOperationalHealthFailure: mockRecordOperationalHealthFailure,
}));

import {
  runAppointmentMaintenance,
  runLockedAppointmentMaintenance,
} from './appointment-maintenance.service.js';

const expiredHold = {
  id: 'hold-a',
  tenantId: 'tenant-a',
  status: 'expired',
} as AppointmentHold;

const reconciliationAppointment = {
  id: 'appointment-a',
  tenantId: 'tenant-a',
  externalCalendarEventId: 'google-event-a',
  metadata: {
    reconciliation: {
      status: 'local_cancelled_external_cancel_failed',
      nextRetryAt: '2026-05-13T12:00:00.000Z',
    },
  },
} as Appointment;

beforeEach(() => {
  mockListActiveTenantIdsForMaintenance.mockReset();
  mockExpireAppointmentHolds.mockReset();
  mockFindReconciliationRetryCandidates.mockReset();
  mockCancelGoogleCalendarAppointment.mockReset();
  mockRescheduleGoogleCalendarAppointment.mockReset();
  mockAcquireDistributedLock.mockReset();
  mockProcessAppointmentReconciliationCandidate.mockReset();
  mockRecordOperationalHealthStarted.mockReset();
  mockRecordOperationalHealthSuccess.mockReset();
  mockRecordOperationalHealthFailure.mockReset();
  mockLogger.info.mockReset();
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
  mockListActiveTenantIdsForMaintenance.mockResolvedValue([]);
  mockExpireAppointmentHolds.mockResolvedValue([]);
  mockFindReconciliationRetryCandidates.mockResolvedValue([]);
  mockProcessAppointmentReconciliationCandidate.mockResolvedValue({
    appointmentId: 'appointment-a',
    status: 'resolved',
  });
  mockFeatures.appointmentReconciliationProcessor = false;
  mockAcquireDistributedLock.mockResolvedValue({
    acquired: true,
    key: 'lock:appointment-maintenance',
    ownerToken: 'owner-a',
    release: vi.fn().mockResolvedValue(true),
  });
  mockRecordOperationalHealthStarted.mockResolvedValue(undefined);
  mockRecordOperationalHealthSuccess.mockResolvedValue(undefined);
  mockRecordOperationalHealthFailure.mockResolvedValue(undefined);
});

describe('appointment maintenance service', () => {
  it('invokes expired hold cleanup and reconciliation discovery per tenant', async () => {
    mockListActiveTenantIdsForMaintenance
      .mockResolvedValueOnce(['tenant-a', 'tenant-b'])
      .mockResolvedValueOnce([]);
    mockExpireAppointmentHolds.mockResolvedValueOnce([expiredHold]).mockResolvedValueOnce([]);
    mockFindReconciliationRetryCandidates
      .mockResolvedValueOnce([reconciliationAppointment])
      .mockResolvedValueOnce([]);
    const now = new Date('2026-05-13T12:05:00.000Z');

    const result = await runAppointmentMaintenance({
      now,
      tenantPageSize: 2,
      holdCleanupLimit: 10,
      reconciliationLimit: 20,
    });

    expect(result).toMatchObject({
      tenantCount: 2,
      expiredHoldCount: 1,
      reconciliationCandidateCount: 1,
      failedTenantCount: 0,
    });
    expect(mockExpireAppointmentHolds).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      now,
      limit: 10,
    });
    expect(mockExpireAppointmentHolds).toHaveBeenCalledWith({
      tenantId: 'tenant-b',
      now,
      limit: 10,
    });
    expect(mockFindReconciliationRetryCandidates).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      now,
      limit: 20,
    });
    expect(mockFindReconciliationRetryCandidates).toHaveBeenCalledWith({
      tenantId: 'tenant-b',
      now,
      limit: 20,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        appointmentId: 'appointment-a',
        externalCalendarEventId: 'google-event-a',
      }),
      'Appointment reconciliation candidate discovered',
    );
  });

  it('isolates tenant failures and continues with other tenants', async () => {
    mockListActiveTenantIdsForMaintenance
      .mockResolvedValueOnce(['tenant-a', 'tenant-b'])
      .mockResolvedValueOnce([]);
    mockExpireAppointmentHolds
      .mockRejectedValueOnce(new Error('cleanup failed'))
      .mockResolvedValueOnce([expiredHold]);
    mockFindReconciliationRetryCandidates.mockResolvedValue([]);

    const result = await runAppointmentMaintenance({
      now: new Date('2026-05-13T12:05:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantCount: 2,
      expiredHoldCount: 1,
      failedTenantCount: 1,
    });
    expect(result.tenants[0]).toMatchObject({
      tenantId: 'tenant-a',
      error: 'cleanup failed',
    });
    expect(result.tenants[1]).toMatchObject({
      tenantId: 'tenant-b',
      expiredHoldCount: 1,
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      'Appointment maintenance failed for tenant',
    );
  });

  it('is safe when no tenants exist', async () => {
    mockListActiveTenantIdsForMaintenance.mockResolvedValueOnce([]);

    const result = await runAppointmentMaintenance({
      now: new Date('2026-05-13T12:05:00.000Z'),
    });

    expect(result).toEqual({
      tenantCount: 0,
      expiredHoldCount: 0,
      reconciliationCandidateCount: 0,
      reconciliationProcessedCount: 0,
      failedTenantCount: 0,
      tenants: [],
    });
    expect(mockExpireAppointmentHolds).not.toHaveBeenCalled();
    expect(mockFindReconciliationRetryCandidates).not.toHaveBeenCalled();
  });

  it('does not mutate Google Calendar while discovering reconciliation candidates', async () => {
    mockListActiveTenantIdsForMaintenance
      .mockResolvedValueOnce(['tenant-a'])
      .mockResolvedValueOnce([]);
    mockFindReconciliationRetryCandidates.mockResolvedValueOnce([reconciliationAppointment]);

    await runAppointmentMaintenance({
      now: new Date('2026-05-13T12:05:00.000Z'),
    });

    expect(mockCancelGoogleCalendarAppointment).not.toHaveBeenCalled();
    expect(mockRescheduleGoogleCalendarAppointment).not.toHaveBeenCalled();
  });

  it('keeps discovery log-only when reconciliation processor feature flag is disabled', async () => {
    mockFeatures.appointmentReconciliationProcessor = false;
    mockListActiveTenantIdsForMaintenance
      .mockResolvedValueOnce(['tenant-a'])
      .mockResolvedValueOnce([]);
    mockFindReconciliationRetryCandidates.mockResolvedValueOnce([reconciliationAppointment]);

    await runAppointmentMaintenance({
      now: new Date('2026-05-13T12:05:00.000Z'),
    });

    expect(mockProcessAppointmentReconciliationCandidate).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appointment-a' }),
      'Appointment reconciliation candidate discovered',
    );
  });

  it('processes candidates when reconciliation processor feature flag is enabled', async () => {
    mockFeatures.appointmentReconciliationProcessor = true;
    mockListActiveTenantIdsForMaintenance
      .mockResolvedValueOnce(['tenant-a'])
      .mockResolvedValueOnce([]);
    mockFindReconciliationRetryCandidates.mockResolvedValueOnce([reconciliationAppointment]);

    await runAppointmentMaintenance({
      now: new Date('2026-05-13T12:05:00.000Z'),
    });

    expect(mockProcessAppointmentReconciliationCandidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointment: reconciliationAppointment,
      now: new Date('2026-05-13T12:05:00.000Z'),
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appointment-a' }),
      'Appointment reconciliation processing started',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appointment-a',
        result: { appointmentId: 'appointment-a', status: 'resolved' },
      }),
      'Appointment reconciliation processing resolved',
    );
  });

  it('runs maintenance when the distributed lock is acquired', async () => {
    const release = vi.fn().mockResolvedValue(true);
    mockAcquireDistributedLock.mockResolvedValueOnce({
      acquired: true,
      key: 'lock:appointment-maintenance',
      ownerToken: 'owner-a',
      release,
    });
    mockListActiveTenantIdsForMaintenance.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await runLockedAppointmentMaintenance({
      now: new Date('2026-05-13T12:05:00.000Z'),
      lockTtlMs: 1234,
    });

    expect(result).toMatchObject({
      ran: true,
      lockKey: 'lock:appointment-maintenance',
      result: {
        tenantCount: 0,
      },
    });
    expect(mockAcquireDistributedLock).toHaveBeenCalledWith({
      key: 'lock:appointment-maintenance',
      ttlMs: 1234,
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockRecordOperationalHealthStarted).toHaveBeenCalledWith({
      component: 'appointment_maintenance',
      now: new Date('2026-05-13T12:05:00.000Z'),
    });
    expect(mockRecordOperationalHealthSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'appointment_maintenance',
        metadata: expect.objectContaining({
          tenantsProcessed: 0,
          tenantsFailed: 0,
          holdsExpired: 0,
          reconciliationCandidatesFound: 0,
          reconciliationCandidatesProcessed: 0,
        }),
      }),
    );
  });

  it('skips maintenance when the distributed lock is already held', async () => {
    mockAcquireDistributedLock.mockResolvedValueOnce({
      acquired: false,
      key: 'lock:appointment-maintenance',
      ownerToken: 'owner-b',
      reason: 'lock_held',
    });

    const result = await runLockedAppointmentMaintenance();

    expect(result).toEqual({
      ran: false,
      lockKey: 'lock:appointment-maintenance',
      skippedReason: 'lock_held',
    });
    expect(mockListActiveTenantIdsForMaintenance).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { lockKey: 'lock:appointment-maintenance' },
      'Appointment maintenance skipped because lock is held',
    );
  });

  it('releases the distributed lock after failed maintenance', async () => {
    const release = vi.fn().mockResolvedValue(true);
    mockAcquireDistributedLock.mockResolvedValueOnce({
      acquired: true,
      key: 'lock:appointment-maintenance',
      ownerToken: 'owner-a',
      release,
    });
    mockListActiveTenantIdsForMaintenance.mockRejectedValueOnce(new Error('tenant query failed'));

    await expect(runLockedAppointmentMaintenance()).rejects.toThrow('tenant query failed');
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockRecordOperationalHealthFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'appointment_maintenance',
        error: expect.any(Error),
        metadata: { phase: 'maintenance_run' },
      }),
    );
  });

  it('skips safely when Redis lock is unavailable', async () => {
    const error = new Error('redis down');
    mockAcquireDistributedLock.mockResolvedValueOnce({
      acquired: false,
      key: 'lock:appointment-maintenance',
      ownerToken: 'owner-a',
      reason: 'redis_unavailable',
      error,
    });

    const result = await runLockedAppointmentMaintenance();

    expect(result).toEqual({
      ran: false,
      lockKey: 'lock:appointment-maintenance',
      skippedReason: 'redis_unavailable',
    });
    expect(mockListActiveTenantIdsForMaintenance).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { lockKey: 'lock:appointment-maintenance', err: error },
      'Appointment maintenance skipped because Redis lock is unavailable',
    );
  });
});
