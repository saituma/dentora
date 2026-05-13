import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, ValidationError } from '../../lib/errors.js';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockGetBookingRules = vi.hoisted(() => vi.fn());
const mockFindAvailableCalendarSlots = vi.hoisted(() => vi.fn());
const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockCreateGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockUpsertPatientProfile = vi.hoisted(() => vi.fn());
const mockCreateAppointmentHold = vi.hoisted(() => vi.fn());
const mockConfirmAppointmentHold = vi.hoisted(() => vi.fn());
const mockAttachExternalCalendarEvent = vi.hoisted(() => vi.fn());
const mockMarkAppointmentReconciliationNeeded = vi.hoisted(() => vi.fn());
const mockSendAppointmentSms = vi.hoisted(() => vi.fn());
const mockForwardCallToHuman = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ db: mockDb }));

vi.mock('../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
  getBookingRules: mockGetBookingRules,
}));

vi.mock('../integrations/integration.service.js', () => ({
  findAvailableCalendarSlots: mockFindAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
  createGoogleCalendarAppointment: mockCreateGoogleCalendarAppointment,
}));

vi.mock('../patients/patients.service.js', () => ({
  upsertPatientProfile: mockUpsertPatientProfile,
}));

vi.mock('../appointments/appointment-ledger.service.js', () => ({
  createAppointmentHold: mockCreateAppointmentHold,
  confirmAppointmentHold: mockConfirmAppointmentHold,
  attachExternalCalendarEvent: mockAttachExternalCalendarEvent,
  markAppointmentReconciliationNeeded: mockMarkAppointmentReconciliationNeeded,
}));

vi.mock('./telephony.service.js', () => ({
  forwardCallToHuman: mockForwardCallToHuman,
  sendAppointmentSms: mockSendAppointmentSms,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import { runWithTenantContext, assertTenantAccess } from '../../db/tenant-context.js';
import { computeOnboardingReadiness, assertTenantReadyForGoLive } from '../onboarding/readiness.js';
import { APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE } from '../appointments/appointment-tool-readiness.js';
import { handleConvaiToolCall } from './convai-tools.js';

interface SelectLimitChain<T> {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

interface SelectWhereChain<T> {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
}

type BookingResult = {
  success?: boolean;
  message?: string;
  appointmentId?: string;
  eventId?: string;
  htmlLink?: string;
};

type SimAppointment = {
  id: string;
  tenantId: string;
  status: 'scheduled' | 'confirmed';
  externalCalendarEventId: string | null;
  metadata: Record<string, unknown>;
};

type SimHold = {
  id: string;
  tenantId: string;
  patientId: string;
  status: 'active' | 'converted';
};

const tenantId = 'tenant-a';
const otherTenantId = 'tenant-b';
const startIso = '2026-06-01T14:00:00.000Z';
const endIso = '2026-06-01T14:30:00.000Z';
const providerSecret = 'secret-google-access-token';

const readyTenant = {
  id: tenantId,
  clinicName: 'Bright Dental',
  clinicSlug: 'bright-dental',
  plan: 'starter',
  status: 'active',
};

const readyActiveConfig = {
  tenantId,
  activeVersion: 1,
  activatedBy: 'user-a',
};

const readyPublishedVersion = {
  id: 'version-a',
  tenantId,
  version: 1,
  status: 'published',
  createdBy: 'user-a',
};

const readyClinic = {
  tenantId,
  clinicName: 'Bright Dental',
  timezone: 'UTC',
  primaryPhone: '+15551234567',
  phone: '+15551234567',
  businessHours: { monday: { start: '09:00', end: '17:00' } },
  staffMembers: [{ name: 'Front Desk', phone: '+15557654321' }],
};

const readyService = {
  tenantId,
  serviceName: 'Dental cleaning',
  durationMinutes: 30,
  isActive: true,
};

const readyBookingRules = {
  tenantId,
  minNoticePeriodHours: 0,
  maxAdvanceBookingDays: 365,
  defaultAppointmentDurationMinutes: 30,
  bufferBetweenAppointmentsMinutes: 0,
  operatingSchedule: { monday: { start: '09:00', end: '17:00' } },
  closedDates: [],
};

const readyPolicy = {
  tenantId,
  escalationConditions: { emergency: 'forward_to_human' },
  emergencyDisclaimer: 'Call 911 for life-threatening emergencies.',
};

const readyVoice = {
  tenantId,
  voiceId: 'voice-a',
  voiceAgentId: 'agent-a',
  greetingMessage: 'Thanks for calling Bright Dental.',
  tone: 'professional',
};

const readyPhoneNumber = {
  tenantId,
  phoneNumber: '+15551234567',
  twilioSid: 'PN123',
  status: 'active',
  capabilities: { voice: true, sms: true },
};

const readyCalendarIntegration = {
  id: 'integration-a',
  tenantId,
  integrationType: 'calendar',
  provider: 'google_calendar',
  status: 'active',
  config: { calendarId: 'primary' },
  credentials: {
    encryptedAccessToken: providerSecret,
    encryptedRefreshToken: 'secret-google-refresh-token',
  },
};

const patientInput = {
  fullName: 'Jane Secret',
  phoneNumber: '+15551234567',
  reasonForVisit: 'Dental cleaning',
  dateOfBirth: '1990-01-01',
};

function selectOne<T>(result: T[]): SelectLimitChain<T> {
  const chain: SelectLimitChain<T> = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function selectMany<T>(result: T[]): SelectWhereChain<T> {
  const chain: SelectWhereChain<T> = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

function queueReadinessRows(
  overrides: {
    phoneNumbers?: unknown[];
    integrations?: unknown[];
    requirePublishedConfig?: boolean;
  } = {},
): void {
  const requirePublishedConfig = overrides.requirePublishedConfig ?? true;
  mockDb.select.mockReturnValueOnce(selectOne([readyTenant]));
  if (requirePublishedConfig) {
    mockDb.select.mockReturnValueOnce(selectOne([readyActiveConfig]));
    mockDb.select.mockReturnValueOnce(selectOne([readyPublishedVersion]));
  }
  mockDb.select.mockReturnValueOnce(selectOne([readyClinic]));
  mockDb.select.mockReturnValueOnce(selectMany([readyService]));
  mockDb.select.mockReturnValueOnce(selectOne([readyBookingRules]));
  mockDb.select.mockReturnValueOnce(selectMany([readyPolicy]));
  mockDb.select.mockReturnValueOnce(selectOne([readyVoice]));
  mockDb.select.mockReturnValueOnce(selectMany(overrides.phoneNumbers ?? [readyPhoneNumber]));
  mockDb.select.mockReturnValueOnce(
    selectMany(overrides.integrations ?? [readyCalendarIntegration]),
  );
}

function withTenant<T>(activeTenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId: activeTenantId, source: 'test' }, callback);
}

function asBookingResult(value: unknown): BookingResult {
  expect(value).toEqual(expect.any(Object));
  return value as BookingResult;
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

let order: string[];
let holds: SimHold[];
let appointments: SimAppointment[];
let availabilityBlocked: boolean;
let failGoogleCreate: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));

  order = [];
  holds = [];
  appointments = [];
  availabilityBlocked = false;
  failGoogleCreate = false;

  mockGetClinicProfile.mockResolvedValue(readyClinic);
  mockGetBookingRules.mockResolvedValue(readyBookingRules);
  mockGetActiveGoogleCalendarIntegration.mockResolvedValue(readyCalendarIntegration);
  mockSendAppointmentSms.mockResolvedValue({ success: true });

  mockFindAvailableCalendarSlots.mockImplementation((input: { tenantId: string }) => {
    assertTenantAccess(input.tenantId);
    order.push('availability');
    if (availabilityBlocked) {
      return Promise.resolve({
        requestedDate: '2026-06-01',
        exactMatch: null,
        suggestedSlots: [],
      });
    }
    return Promise.resolve({
      requestedDate: '2026-06-01',
      exactMatch: { startIso, endIso, label: 'June 1 at 2:00 PM' },
      suggestedSlots: [{ startIso, endIso, label: 'June 1 at 2:00 PM' }],
    });
  });

  mockUpsertPatientProfile.mockImplementation((input: { tenantId: string; fullName: string }) => {
    assertTenantAccess(input.tenantId);
    order.push('patient-upsert');
    return Promise.resolve({ id: 'patient-a', fullName: input.fullName });
  });

  mockCreateAppointmentHold.mockImplementation((input: { tenantId: string; patientId: string }) => {
    assertTenantAccess(input.tenantId);
    expect(order).toEqual(['availability', 'patient-upsert']);
    order.push('hold-created');
    const hold: SimHold = {
      id: 'hold-a',
      tenantId: input.tenantId,
      patientId: input.patientId,
      status: 'active',
    };
    holds.push(hold);
    return Promise.resolve(hold);
  });

  mockConfirmAppointmentHold.mockImplementation((input: { tenantId: string; holdId: string }) => {
    assertTenantAccess(input.tenantId);
    const hold = holds.find((item) => item.id === input.holdId && item.tenantId === input.tenantId);
    if (!hold) throw new ValidationError('Appointment hold not found');
    expect(order).toEqual(['availability', 'patient-upsert', 'hold-created']);
    order.push('hold-confirmed');
    hold.status = 'converted';
    const appointment: SimAppointment = {
      id: 'appointment-a',
      tenantId: input.tenantId,
      status: 'scheduled',
      externalCalendarEventId: null,
      metadata: {},
    };
    appointments.push(appointment);
    return Promise.resolve(appointment);
  });

  mockCreateGoogleCalendarAppointment.mockImplementation((input: { tenantId: string }) => {
    assertTenantAccess(input.tenantId);
    const localAppointment = appointments.find((item) => item.tenantId === input.tenantId);
    expect(localAppointment).toMatchObject({ id: 'appointment-a', status: 'scheduled' });
    expect(order).toEqual(['availability', 'patient-upsert', 'hold-created', 'hold-confirmed']);
    order.push('google-event-created');
    if (failGoogleCreate) {
      throw new Error('Raw Google provider failure with secret-google-access-token');
    }
    return Promise.resolve({
      eventId: 'google-event-a',
      htmlLink: 'https://calendar.example/event-a',
      slot: { startIso, endIso, label: 'June 1 at 2:00 PM' },
    });
  });

  mockAttachExternalCalendarEvent.mockImplementation(
    (input: { tenantId: string; appointmentId: string; externalCalendarEventId: string }) => {
      assertTenantAccess(input.tenantId);
      expect(order).toEqual([
        'availability',
        'patient-upsert',
        'hold-created',
        'hold-confirmed',
        'google-event-created',
      ]);
      order.push('external-event-attached');
      const appointment = appointments.find(
        (item) => item.id === input.appointmentId && item.tenantId === input.tenantId,
      );
      if (!appointment) throw new ValidationError('Appointment not found');
      appointment.status = 'confirmed';
      appointment.externalCalendarEventId = input.externalCalendarEventId;
      return Promise.resolve(appointment);
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AI receptionist booking simulation', () => {
  it('books a ready tenant through ConvAI tool dispatch, ledger flow, and Google event attach', async () => {
    queueReadinessRows();

    const result = await withTenant(tenantId, async () => {
      const readiness = await computeOnboardingReadiness(tenantId);
      expect(readiness).toMatchObject({ ready: true, blockingIssues: [] });
      queueReadinessRows();

      return handleConvaiToolCall({
        tenantId,
        toolName: 'create_appointment',
        callSessionId: 'call-session-a',
        params: {
          startIso,
          endIso,
          ...patientInput,
        },
      });
    });

    const booking = asBookingResult(result);

    expect(order).toEqual([
      'availability',
      'patient-upsert',
      'hold-created',
      'hold-confirmed',
      'google-event-created',
      'external-event-attached',
    ]);
    expect(mockFindAvailableCalendarSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
        appointmentDurationMinutes: 30,
      }),
    );
    expect(mockUpsertPatientProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        fullName: patientInput.fullName,
        phoneNumber: patientInput.phoneNumber,
      }),
    );
    expect(mockCreateGoogleCalendarAppointment.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockConfirmAppointmentHold.mock.invocationCallOrder[0],
    );
    expect(appointments[0]).toMatchObject({
      status: 'confirmed',
      externalCalendarEventId: 'google-event-a',
    });
    expect(booking).toMatchObject({
      success: true,
      message: 'Appointment booked successfully.',
      appointmentId: 'appointment-a',
      eventId: 'google-event-a',
      htmlLink: 'https://calendar.example/event-a',
    });
    expect(serialized(booking)).not.toContain(providerSecret);
    expect(serialized(booking)).not.toContain('Raw Google provider failure');
    expect(serialized(mockLogger.info.mock.calls)).not.toContain(patientInput.fullName);
    expect(serialized(mockLogger.info.mock.calls)).not.toContain(patientInput.phoneNumber);
  });

  it('rejects booking safely when tenant context is missing', async () => {
    const result = await handleConvaiToolCall({
      tenantId,
      toolName: 'create_appointment',
      params: {
        startIso,
        endIso,
        ...patientInput,
      },
    });

    expect(asBookingResult(result)).toEqual({
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    });
    expect(mockCreateGoogleCalendarAppointment).not.toHaveBeenCalled();
    expect(appointments).toEqual([]);
  });

  it('returns safe failure and skips Google event creation when ledger-aware availability is blocked', async () => {
    availabilityBlocked = true;
    queueReadinessRows();

    const result = await withTenant(tenantId, () =>
      handleConvaiToolCall({
        tenantId,
        toolName: 'create_appointment',
        params: {
          startIso,
          endIso,
          ...patientInput,
        },
      }),
    );

    expect(order).toEqual(['availability']);
    expect(asBookingResult(result)).toEqual({
      success: false,
      message:
        'I could not book that appointment safely. Please try another time or contact the front desk.',
    });
    expect(mockUpsertPatientProfile).not.toHaveBeenCalled();
    expect(mockCreateAppointmentHold).not.toHaveBeenCalled();
    expect(mockCreateGoogleCalendarAppointment).not.toHaveBeenCalled();
  });

  it('leaves the local appointment non-confirmed when Google event creation fails', async () => {
    failGoogleCreate = true;
    queueReadinessRows();

    const result = await withTenant(tenantId, () =>
      handleConvaiToolCall({
        tenantId,
        toolName: 'create_appointment',
        params: {
          startIso,
          endIso,
          ...patientInput,
        },
      }),
    );

    expect(order).toEqual([
      'availability',
      'patient-upsert',
      'hold-created',
      'hold-confirmed',
      'google-event-created',
    ]);
    expect(appointments[0]).toMatchObject({
      status: 'scheduled',
      externalCalendarEventId: null,
    });
    expect(mockAttachExternalCalendarEvent).not.toHaveBeenCalled();
    expect(mockMarkAppointmentReconciliationNeeded).not.toHaveBeenCalled();
    expect(asBookingResult(result)).toEqual({
      success: false,
      message:
        'I could not book that appointment safely. Please try another time or contact the front desk.',
    });
    expect(serialized(result)).not.toContain(providerSecret);
    expect(serialized(result)).not.toContain('Raw Google provider failure');
  });

  it('uses the readiness guard to block go-live when required setup is missing', async () => {
    queueReadinessRows({ phoneNumbers: [], requirePublishedConfig: false });

    await expect(withTenant(tenantId, () => assertTenantReadyForGoLive(tenantId))).rejects.toThrow(
      ValidationError,
    );
  });

  it('rejects cross-tenant booking before patient, hold, or Google event creation', async () => {
    const result = await withTenant(otherTenantId, () =>
      handleConvaiToolCall({
        tenantId,
        toolName: 'create_appointment',
        params: {
          startIso,
          endIso,
          ...patientInput,
        },
      }),
    );

    expect(asBookingResult(result)).toEqual({
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    });
    expect(mockUpsertPatientProfile).not.toHaveBeenCalled();
    expect(mockCreateAppointmentHold).not.toHaveBeenCalled();
    expect(mockCreateGoogleCalendarAppointment).not.toHaveBeenCalled();
  });

  it('throws an authorization error for cross-tenant readiness checks before DB reads', async () => {
    await expect(
      withTenant(otherTenantId, () => computeOnboardingReadiness(tenantId)),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
