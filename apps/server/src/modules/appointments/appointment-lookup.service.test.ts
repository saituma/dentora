import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../../lib/errors.js';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));
const mockCreateStaffReviewItemSafely = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({ db: mockDb }));
vi.mock('../staff-review/staff-review.service.js', () => ({
  createStaffReviewItemSafely: mockCreateStaffReviewItemSafely,
}));

import { runWithTenantContext } from '../../db/tenant-context.js';
import type { Appointment } from './appointment-ledger.service.js';
import {
  APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
  APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
  resolveVerifiedAppointmentForCaller,
} from './appointment-lookup.service.js';

interface SelectWhereLimitChain<T> {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

function selectRows<T>(rows: T[]): SelectWhereLimitChain<T> {
  const chain: SelectWhereLimitChain<T> = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-a',
    tenantId: 'tenant-a',
    patientId: 'patient-a',
    serviceId: null,
    staffId: null,
    callSessionId: null,
    status: 'confirmed',
    startAt: new Date('2026-06-01T14:00:00.000Z'),
    endAt: new Date('2026-06-01T14:30:00.000Z'),
    timezone: 'UTC',
    calendarIntegrationId: 'integration-a',
    externalCalendarEventId: 'google-event-a',
    idempotencyKey: 'book-a',
    metadata: {},
    createdAt: new Date('2026-05-01T12:00:00.000Z'),
    updatedAt: new Date('2026-05-01T12:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ledger-backed appointment lookup', () => {
  it('rejects phone-only lookup with a safe clarification', async () => {
    const result = await withTenant('tenant-a', () =>
      resolveVerifiedAppointmentForCaller({
        tenantId: 'tenant-a',
        phoneNumber: '+15551234567',
      }),
    );

    expect(result).toEqual({
      success: false,
      reason: 'missing_verification',
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        type: 'ai_tool_safety_block',
        reasonCode: 'APPOINTMENT_VERIFICATION_INCOMPLETE',
      }),
    );
  });

  it('resolves by local appointment confirmation id without Google text lookup', async () => {
    mockDb.select.mockReturnValueOnce(selectRows([appointment()]));

    const result = await withTenant('tenant-a', () =>
      resolveVerifiedAppointmentForCaller({
        tenantId: 'tenant-a',
        confirmationId: 'appointment-a',
      }),
    );

    expect(result).toMatchObject({
      success: true,
      externalCalendarEventId: 'google-event-a',
    });
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('resolves by external event id from the local ledger for legacy response compatibility', async () => {
    mockDb.select
      .mockReturnValueOnce(selectRows<Appointment>([]))
      .mockReturnValueOnce(selectRows([appointment()]));

    const result = await withTenant('tenant-a', () =>
      resolveVerifiedAppointmentForCaller({
        tenantId: 'tenant-a',
        externalCalendarEventId: 'google-event-a',
      }),
    );

    expect(result).toMatchObject({
      success: true,
      externalCalendarEventId: 'google-event-a',
    });
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it('resolves by phone hash, DOB, and appointment date/time window', async () => {
    mockDb.select.mockReturnValueOnce(selectRows([{ appointment: appointment() }]));

    const result = await withTenant('tenant-a', () =>
      resolveVerifiedAppointmentForCaller({
        tenantId: 'tenant-a',
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        appointmentDate: '2026-06-01',
        appointmentTime: '14:00',
      }),
    );

    expect(result).toMatchObject({
      success: true,
      externalCalendarEventId: 'google-event-a',
    });
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('returns clarification when multiple verified appointments match', async () => {
    mockDb.select.mockReturnValueOnce(
      selectRows([
        { appointment: appointment({ id: 'appointment-a' }) },
        { appointment: appointment({ id: 'appointment-b' }) },
      ]),
    );

    const result = await withTenant('tenant-a', () =>
      resolveVerifiedAppointmentForCaller({
        tenantId: 'tenant-a',
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        appointmentDate: '2026-06-01',
        appointmentTime: '14:00',
      }),
    );

    expect(result).toEqual({
      success: false,
      reason: 'multiple_matches',
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });
  });

  it('returns safe not-found when no verified appointment matches', async () => {
    mockDb.select.mockReturnValueOnce(selectRows<{ appointment: Appointment }>([]));

    const result = await withTenant('tenant-a', () =>
      resolveVerifiedAppointmentForCaller({
        tenantId: 'tenant-a',
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        appointmentDate: '2026-06-01',
        appointmentTime: '14:00',
      }),
    );

    expect(result).toEqual({
      success: false,
      reason: 'not_found',
      message: APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
    });
  });

  it('rejects cross-tenant appointment lookup before DB reads', async () => {
    await expect(
      withTenant('tenant-b', () =>
        resolveVerifiedAppointmentForCaller({
          tenantId: 'tenant-a',
          confirmationId: 'appointment-a',
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
