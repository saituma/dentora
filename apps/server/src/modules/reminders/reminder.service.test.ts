import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockFeatures = vi.hoisted(() => ({ appointmentReminders: true }));
const mockEnqueueJob = vi.hoisted(() => vi.fn());
const mockSendPatientMessage = vi.hoisted(() => vi.fn());
const mockGetPatientProfileById = vi.hoisted(() => vi.fn());
const mockGetClinicProfile = vi.hoisted(() => vi.fn());

// db chain mocks
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockOnConflictDoNothing = vi.hoisted(() => vi.fn(() => ({ returning: mockInsertReturning })));
const mockValues = vi.hoisted(() =>
  vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing })),
);
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockValues })));

const mockSelectLimit = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockSelectLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockSelectWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

const mockUpdateWhere = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockSet = vi.hoisted(() => vi.fn(() => ({ where: mockUpdateWhere })));
const mockUpdate = vi.hoisted(() => vi.fn(() => ({ set: mockSet })));

vi.mock('../../config/features.js', () => ({ features: mockFeatures }));
vi.mock('../../lib/queue.js', () => ({
  enqueueJob: mockEnqueueJob,
  QUEUE_NAMES: { APPOINTMENT_REMINDERS: 'appointment-reminders' },
}));
vi.mock('../../lib/twilio-messaging.js', () => ({ sendPatientMessage: mockSendPatientMessage }));
vi.mock('../patients/patients.service.js', () => ({
  getPatientProfileById: mockGetPatientProfileById,
}));
vi.mock('../config/config.service.js', () => ({ getClinicProfile: mockGetClinicProfile }));
vi.mock('../../db/tenant-context.js', () => ({
  assertTenantAccess: (tenantId: string) => tenantId,
}));
vi.mock('../../db/index.js', () => ({
  db: { insert: mockInsert, select: mockSelect, update: mockUpdate },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { scheduleAppointmentReminders, sendDueReminder } from './reminder.service.js';

const TENANT = 'tenant-a';

function consentedPatient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'patient-a',
    fullName: 'Jane Doe',
    phoneNumber: '+447700900123',
    messagingConsent: true,
    messagingOptedOutAt: null,
    preferredReminderChannel: 'sms',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does not drain the mockResolvedValueOnce queue — reset it explicitly so
  // stale once-values from a prior test don't leak into the next.
  mockSelectLimit.mockReset();
  mockFeatures.appointmentReminders = true;
  mockInsertReturning.mockResolvedValue([{ id: 'reminder-a' }]);
  mockGetClinicProfile.mockResolvedValue({ clinicName: 'Smile Dental' });
});

describe('scheduleAppointmentReminders', () => {
  it('is a no-op when the feature flag is off', async () => {
    mockFeatures.appointmentReminders = false;

    await scheduleAppointmentReminders({
      tenantId: TENANT,
      appointmentId: 'appt-a',
      patientId: 'patient-a',
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    expect(mockGetPatientProfileById).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it('inserts a reminder and enqueues a delayed job for a future appointment', async () => {
    mockGetPatientProfileById.mockResolvedValue(consentedPatient());

    await scheduleAppointmentReminders({
      tenantId: TENANT,
      appointmentId: 'appt-a',
      patientId: 'patient-a',
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        appointmentId: 'appt-a',
        patientId: 'patient-a',
        channel: 'sms',
        offsetHours: 24,
      }),
    );
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      'appointment-reminders',
      { tenantId: TENANT, reminderId: 'reminder-a' },
      expect.objectContaining({ deduplicationId: 'reminder:reminder-a' }),
    );
    const delay = (mockEnqueueJob.mock.calls[0][2] as { delay: number }).delay;
    expect(delay).toBeGreaterThan(0);
  });

  it('skips offsets whose fire time is already in the past', async () => {
    mockGetPatientProfileById.mockResolvedValue(consentedPatient());

    // Appointment is only 1h away → the 24h reminder is already past due.
    await scheduleAppointmentReminders({
      tenantId: TENANT,
      appointmentId: 'appt-a',
      patientId: 'patient-a',
      startAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it('does not schedule when the patient preference is none', async () => {
    mockGetPatientProfileById.mockResolvedValue(
      consentedPatient({ preferredReminderChannel: 'none' }),
    );

    await scheduleAppointmentReminders({
      tenantId: TENANT,
      appointmentId: 'appt-a',
      patientId: 'patient-a',
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('sendDueReminder', () => {
  function arrangeRow(reminderOverrides = {}, appointmentOverrides = {}) {
    mockSelectLimit
      .mockResolvedValueOnce([
        {
          id: 'reminder-a',
          tenantId: TENANT,
          appointmentId: 'appt-a',
          patientId: 'patient-a',
          channel: 'sms',
          status: 'pending',
          ...reminderOverrides,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'appt-a',
          tenantId: TENANT,
          status: 'scheduled',
          startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          timezone: 'Europe/London',
          ...appointmentOverrides,
        },
      ]);
  }

  it('skips without sending when the patient has not consented', async () => {
    arrangeRow();
    mockGetPatientProfileById.mockResolvedValue(consentedPatient({ messagingConsent: false }));

    await sendDueReminder({ tenantId: TENANT, reminderId: 'reminder-a' });

    expect(mockSendPatientMessage).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', failureReason: 'no_consent' }),
    );
  });

  it('sends and marks sent when the patient has consented', async () => {
    arrangeRow();
    mockGetPatientProfileById.mockResolvedValue(consentedPatient());
    mockSendPatientMessage.mockResolvedValue({ sent: true, dryRun: false, messageSid: 'SM123' });

    await sendDueReminder({ tenantId: TENANT, reminderId: 'reminder-a' });

    expect(mockSendPatientMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, channel: 'sms', to: '+447700900123' }),
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', twilioMessageSid: 'SM123' }),
    );
  });

  it('skips a cancelled appointment', async () => {
    arrangeRow({}, { status: 'cancelled' });

    await sendDueReminder({ tenantId: TENANT, reminderId: 'reminder-a' });

    expect(mockGetPatientProfileById).not.toHaveBeenCalled();
    expect(mockSendPatientMessage).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', failureReason: 'appointment_cancelled' }),
    );
  });

  it('is a no-op for an already-resolved reminder', async () => {
    arrangeRow({ status: 'sent' });

    await sendDueReminder({ tenantId: TENANT, reminderId: 'reminder-a' });

    expect(mockGetPatientProfileById).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rethrows on a transient send failure so the job retries', async () => {
    arrangeRow();
    mockGetPatientProfileById.mockResolvedValue(consentedPatient());
    mockSendPatientMessage.mockResolvedValue({ sent: false, reason: 'timeout' });

    await expect(sendDueReminder({ tenantId: TENANT, reminderId: 'reminder-a' })).rejects.toThrow(
      /timeout/,
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', failureReason: 'timeout' }),
    );
  });
});
