import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, AppointmentHold } from './appointment-ledger.service.js';

const mockListActiveTenantIdsForMaintenance = vi.hoisted(() => vi.fn());
const mockExpireAppointmentHolds = vi.hoisted(() => vi.fn());
const mockFindReconciliationRetryCandidates = vi.hoisted(() => vi.fn());
const mockCancelGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
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
}));

vi.mock('../integrations/google-calendar-appointments.js', () => ({
  cancelGoogleCalendarAppointment: mockCancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment: mockRescheduleGoogleCalendarAppointment,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import { runAppointmentMaintenance } from './appointment-maintenance.service.js';

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
  vi.clearAllMocks();
  mockListActiveTenantIdsForMaintenance.mockResolvedValue([]);
  mockExpireAppointmentHolds.mockResolvedValue([]);
  mockFindReconciliationRetryCandidates.mockResolvedValue([]);
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
});
