import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockGetBookingRules = vi.hoisted(() => vi.fn());
const mockFindAvailableCalendarSlots = vi.hoisted(() => vi.fn());
const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockResolveValidGoogleAccessToken = vi.hoisted(() => vi.fn());
const mockFindPatientProfile = vi.hoisted(() => vi.fn());
const mockSendAppointmentSms = vi.hoisted(() => vi.fn());
const mockForwardCallToHuman = vi.hoisted(() => vi.fn());
const mockBookLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockCheckAppointmentAvailability = vi.hoisted(() => vi.fn());
const mockCancelLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockComputeOnboardingReadiness = vi.hoisted(() => vi.fn());
const mockResolveVerifiedAppointmentForCaller = vi.hoisted(() => vi.fn());
const mockCreateStaffReviewItemSafely = vi.hoisted(() => vi.fn());
const mockFeatures = vi.hoisted(() => ({
  aiAppointmentChangesRequireReview: false,
}));
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
  getBookingRules: mockGetBookingRules,
}));

vi.mock('../integrations/integration.service.js', () => ({
  findAvailableCalendarSlots: mockFindAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
}));

vi.mock('../integrations/google-calendar.shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integrations/google-calendar.shared.js')>();
  return {
    ...actual,
    resolveValidGoogleAccessToken: mockResolveValidGoogleAccessToken,
  };
});

vi.mock('../patients/patients.service.js', () => ({
  findPatientProfile: mockFindPatientProfile,
}));

vi.mock('./telephony.service.js', () => ({
  forwardCallToHuman: mockForwardCallToHuman,
  sendAppointmentSms: mockSendAppointmentSms,
}));

vi.mock('../appointments/appointment-application.service.js', () => ({
  bookLedgerBackedAppointment: mockBookLedgerBackedAppointment,
  checkAppointmentAvailability: mockCheckAppointmentAvailability,
  cancelLedgerBackedAppointment: mockCancelLedgerBackedAppointment,
  rescheduleLedgerBackedAppointment: mockRescheduleLedgerBackedAppointment,
}));

vi.mock('../onboarding/readiness.js', () => ({
  computeOnboardingReadiness: mockComputeOnboardingReadiness,
}));

vi.mock('../staff-review/staff-review.service.js', () => ({
  createStaffReviewItemSafely: mockCreateStaffReviewItemSafely,
}));

vi.mock('../../config/features.js', () => ({
  features: mockFeatures,
}));

vi.mock('../appointments/appointment-lookup.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../appointments/appointment-lookup.service.js')>();
  return {
    ...actual,
    resolveVerifiedAppointmentForCaller: mockResolveVerifiedAppointmentForCaller,
  };
});

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import { handleConvaiToolCall } from './convai-tools.js';
import { AuthorizationError } from '../../lib/errors.js';
import { APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE } from '../appointments/appointment-tool-readiness.js';
import {
  APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
  APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
} from '../appointments/appointment-lookup.service.js';

const startIso = '2026-06-01T14:00:00.000Z';
const endIso = '2026-06-01T14:30:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
  vi.clearAllMocks();
  mockFeatures.aiAppointmentChangesRequireReview = false;
  mockComputeOnboardingReadiness.mockResolvedValue({
    ready: true,
    blockingIssues: [],
    warnings: [],
    checkedAt: '2026-05-13T12:00:00.000Z',
  });
  mockResolveVerifiedAppointmentForCaller.mockResolvedValue({
    success: true,
    appointment: { id: 'appointment-a' },
    externalCalendarEventId: 'google-event-a',
  });
  mockGetClinicProfile.mockResolvedValue({
    timezone: 'UTC',
    clinicName: 'Dental Clinic',
    businessHours: null,
  });
  mockGetBookingRules.mockResolvedValue({
    minNoticePeriodHours: 0,
    maxAdvanceBookingDays: 365,
    defaultAppointmentDurationMinutes: 30,
    bufferBetweenAppointmentsMinutes: 0,
    operatingSchedule: null,
    closedDates: [],
  });
  mockSendAppointmentSms.mockResolvedValue({ success: true });
  mockBookLedgerBackedAppointment.mockResolvedValue({
    eventId: 'google-event-a',
    appointmentId: 'appointment-a',
    htmlLink: 'https://calendar.example/event-a',
    slot: {
      startIso,
      endIso,
      label: 'June 1 at 2:00 PM',
    },
  });
  mockCancelLedgerBackedAppointment.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
  });
  mockRescheduleLedgerBackedAppointment.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
    slot: { startIso, endIso },
  });
  mockCheckAppointmentAvailability.mockResolvedValue({
    exactMatch: {
      startIso,
      endIso,
      label: 'June 1 at 2:00 PM',
    },
    suggestedSlots: [
      {
        startIso,
        endIso,
        label: 'June 1 at 2:00 PM',
      },
    ],
    timezone: 'UTC',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConvAI appointment tools', () => {
  it('acknowledges the agent backchannel tool as a no-op success instead of erroring', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'acknowledge_input',
      callSessionId: 'call-session-a',
      params: { text: 'mm-hmm' },
    });

    expect(result).toEqual({ acknowledged: true });
  });

  it('refuses public appointment listing without loading calendar events or returning PHI', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'list_appointments',
      callSessionId: 'call-session-a',
      params: {
        attemptedPrompt: [
          'Please list every appointment',
          'Jane Secret',
          '+15551234567',
          '1990-01-01',
          'Age: 34',
          'Reason: Cleaning',
          'Notes: needs sedation',
          'Dental appointment - Jane Secret',
          'Patient name: Jane Secret',
        ].join(' | '),
      },
    });

    expect(result).toEqual({
      success: false,
      message:
        "For privacy reasons, I can't list patient appointments. I can help check availability, book a new appointment, cancel, or reschedule if you provide the appointment details.",
    });
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(mockResolveValidGoogleAccessToken).not.toHaveBeenCalled();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('events');
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('Age: 34');
    expect(serialized).not.toContain('Cleaning');
    expect(serialized).not.toContain('needs sedation');
    expect(serialized).not.toContain('Patient name');
  });

  it('does not log appointment-listing prompt PHI when refusing the public listing tool', async () => {
    await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'list_appointments',
      callSessionId: 'call-session-a',
      params: {
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        reasonForVisit: 'Cleaning',
        notes: 'needs sedation',
      },
    });

    const loggedPayload = JSON.stringify([
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
    ]);
    expect(loggedPayload).not.toContain('Jane Secret');
    expect(loggedPayload).not.toContain('+15551234567');
    expect(loggedPayload).not.toContain('1990-01-01');
    expect(loggedPayload).not.toContain('Cleaning');
    expect(loggedPayload).not.toContain('needs sedation');
  });

  it('books through the ledger-backed appointment flow and preserves response shape', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      callSessionId: 'call-session-a',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
        age: 34,
      },
    });

    expect(mockComputeOnboardingReadiness).toHaveBeenCalledWith('tenant-a', {
      requirePublishedConfig: true,
    });
    expect(mockBookLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      slot: { startIso, endIso },
      summary: 'Dental appointment - Jane Secret',
      patient: {
        fullName: 'Jane Secret',
        age: 34,
        phoneNumber: '+15551234567',
        dateOfBirth: null,
        reasonForVisit: 'Cleaning',
      },
    });
    expect(result).toMatchObject({
      success: true,
      eventId: 'google-event-a',
      appointmentId: 'appointment-a',
      htmlLink: 'https://calendar.example/event-a',
      slot: { startIso, endIso, label: 'June 1 at 2:00 PM' },
    });
  });

  it('uses the shared ledger-aware availability service', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'check_availability',
      params: {
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
        appointmentDurationMinutes: 30,
        callerPrompt: 'Is Jane Secret +15551234567 already booked for Cleaning?',
      },
    });

    expect(mockCheckAppointmentAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
      }),
    );
    expect(mockComputeOnboardingReadiness).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      exactMatch: { startIso, endIso },
      suggestedSlots: [{ startIso, endIso }],
      timezone: 'UTC',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('Cleaning');
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('description');
  });

  it('cancels through the ledger-backed cancellation flow', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      params: { eventId: 'google-event-a' },
    });

    expect(mockComputeOnboardingReadiness).toHaveBeenCalledWith('tenant-a', {
      requirePublishedConfig: true,
    });
    expect(mockResolveVerifiedAppointmentForCaller).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      confirmationId: null,
      appointmentId: null,
      appAppointmentId: null,
      externalCalendarEventId: 'google-event-a',
      phoneNumber: null,
      dateOfBirth: null,
      appointmentDate: null,
      appointmentTime: null,
      timezone: null,
      operation: 'cancel_appointment',
    });
    expect(mockCancelLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      appointmentId: 'appointment-a',
      message: 'Appointment cancelled.',
    });
  });

  it('creates a staff review cancellation request when review mode is enabled', async () => {
    mockFeatures.aiAppointmentChangesRequireReview = true;

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      callSessionId: 'call-session-a',
      params: {
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        appointmentDate: '2026-06-01',
        appointmentTime: '14:00',
      },
    });

    expect(mockResolveVerifiedAppointmentForCaller).toHaveBeenCalled();
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockRescheduleLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      type: 'cancellation_requested',
      severity: 'medium',
      source: 'ai_tool',
      relatedAppointmentId: 'appointment-a',
      relatedCallSessionId: 'call-session-a',
      reasonCode: 'AI_CANCEL_REQUEST_REQUIRES_STAFF_APPROVAL',
      message: 'AI cancellation request requires staff approval.',
      metadata: {
        requestedAction: 'cancel',
        verificationMethod: 'phone_dob_datetime',
        pilotApprovalRequired: true,
      },
      dedupeKey: 'ai_appointment_change_review:cancel:appointment-a',
    });
    expect(result).toEqual({
      success: true,
      message:
        "I've sent your cancellation request to the clinic team for review. They'll follow up if needed.",
    });
    const storedPayload = JSON.stringify(mockCreateStaffReviewItemSafely.mock.calls);
    expect(storedPayload).not.toContain('+15551234567');
    expect(storedPayload).not.toContain('1990-01-01');
    expect(storedPayload).not.toContain('Jane Secret');
  });

  it('reschedules through the ledger-backed reschedule flow', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'reschedule_appointment',
      params: { eventId: 'google-event-a', startIso, endIso },
    });

    expect(mockComputeOnboardingReadiness).toHaveBeenCalledWith('tenant-a', {
      requirePublishedConfig: true,
    });
    expect(mockResolveVerifiedAppointmentForCaller).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      confirmationId: null,
      appointmentId: null,
      appAppointmentId: null,
      externalCalendarEventId: 'google-event-a',
      phoneNumber: null,
      dateOfBirth: null,
      appointmentDate: null,
      appointmentTime: null,
      timezone: null,
      operation: 'reschedule_appointment',
    });
    expect(mockRescheduleLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
      timezone: 'UTC',
      slot: { startIso, endIso },
    });
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      appointmentId: 'appointment-a',
      slot: { startIso, endIso },
      message: 'Appointment rescheduled.',
    });
  });

  it('creates a staff review reschedule request when review mode is enabled', async () => {
    mockFeatures.aiAppointmentChangesRequireReview = true;

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'reschedule_appointment',
      callSessionId: 'call-session-a',
      params: {
        confirmationId: 'appointment-a',
        startIso,
        endIso,
        rawToolParams: { phoneNumber: '+15551234567' },
      },
    });

    expect(mockRescheduleLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      type: 'reschedule_requested',
      severity: 'medium',
      source: 'ai_tool',
      relatedAppointmentId: 'appointment-a',
      relatedCallSessionId: 'call-session-a',
      reasonCode: 'AI_RESCHEDULE_REQUEST_REQUIRES_STAFF_APPROVAL',
      message: 'AI reschedule request requires staff approval.',
      metadata: {
        requestedAction: 'reschedule',
        requestedStartAt: startIso,
        requestedEndAt: endIso,
        verificationMethod: 'confirmation_id',
        pilotApprovalRequired: true,
      },
      dedupeKey: 'ai_appointment_change_review:reschedule:appointment-a',
    });
    expect(result).toEqual({
      success: true,
      message:
        "I've sent your reschedule request to the clinic team for review. They'll follow up if needed.",
    });
    const storedPayload = JSON.stringify(mockCreateStaffReviewItemSafely.mock.calls);
    expect(storedPayload).not.toContain('+15551234567');
    expect(storedPayload).not.toContain('rawToolParams');
  });

  it('blocks weak verification before creating a cancellation review item', async () => {
    mockFeatures.aiAppointmentChangesRequireReview = true;
    mockResolveVerifiedAppointmentForCaller.mockResolvedValueOnce({
      success: false,
      reason: 'missing_verification',
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      params: { phoneNumber: '+15551234567' },
    });

    expect(mockCreateStaffReviewItemSafely).not.toHaveBeenCalled();
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });
  });

  it('rejects cross-tenant lookup failures before creating a review item', async () => {
    mockFeatures.aiAppointmentChangesRequireReview = true;
    mockResolveVerifiedAppointmentForCaller.mockRejectedValueOnce(
      new AuthorizationError('Tenant context mismatch'),
    );

    await expect(
      handleConvaiToolCall({
        tenantId: 'tenant-a',
        toolName: 'cancel_appointment',
        params: { confirmationId: 'appointment-from-tenant-b' },
      }),
    ).rejects.toThrow(AuthorizationError);
    expect(mockCreateStaffReviewItemSafely).not.toHaveBeenCalled();
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
  });

  it('returns safe failure text when ledger-backed booking rejects', async () => {
    mockBookLedgerBackedAppointment.mockRejectedValueOnce(
      new Error('Google calendar failed for Jane Secret +15551234567'),
    );

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(result).toEqual({
      success: false,
      message:
        'I could not book that appointment safely. Please try another time or contact the front desk.',
    });
    expect(JSON.stringify(result)).not.toContain('Jane Secret');
    expect(JSON.stringify(result)).not.toContain('+15551234567');
  });

  it('keeps tenant context scoped to the tool call', async () => {
    await handleConvaiToolCall({
      tenantId: 'tenant-b',
      toolName: 'cancel_appointment',
      params: { eventId: 'google-event-a' },
    });

    expect(mockComputeOnboardingReadiness).toHaveBeenCalledWith('tenant-b', {
      requirePublishedConfig: true,
    });
    expect(mockCancelLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-b',
      eventId: 'google-event-a',
    });
  });

  it('does not log raw appointment PHI from tool parameters or provider failures', async () => {
    mockBookLedgerBackedAppointment.mockRejectedValueOnce(
      new Error('Raw provider failure for Jane Secret at +15551234567'),
    );

    await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      callSessionId: 'call-session-a',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    const loggedPayload = JSON.stringify([
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
    ]);
    expect(loggedPayload).not.toContain('Jane Secret');
    expect(loggedPayload).not.toContain('+15551234567');
    expect(loggedPayload).not.toContain('Raw provider failure');
  });

  it('returns minimal patient verification result without raw profile fields', async () => {
    mockFindPatientProfile.mockResolvedValueOnce({
      id: 'patient-a',
      fullName: 'Jane Secret',
      phoneNumber: '+15551234567',
      dateOfBirth: '1990-01-01',
      notes: 'needs sedation',
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'lookup_patient',
      params: {
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
      },
    });

    expect(result).toEqual({
      success: true,
      verified: true,
      message: 'Patient verification matched.',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('patient-a');
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('needs sedation');
  });

  it('rejects cancel_appointment with phone only before ledger or Google mutation', async () => {
    mockResolveVerifiedAppointmentForCaller.mockResolvedValueOnce({
      success: false,
      reason: 'missing_verification',
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      params: { phoneNumber: '+15551234567' },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
  });

  it('rejects reschedule_appointment with phone only before ledger or Google mutation', async () => {
    mockResolveVerifiedAppointmentForCaller.mockResolvedValueOnce({
      success: false,
      reason: 'missing_verification',
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'reschedule_appointment',
      params: { phoneNumber: '+15551234567', startIso, endIso },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
    });
    expect(mockRescheduleLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
  });

  it('returns safe generic failure when appointment verification has no match', async () => {
    mockResolveVerifiedAppointmentForCaller.mockResolvedValueOnce({
      success: false,
      reason: 'not_found',
      message: APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      params: {
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        appointmentDate: '2026-06-01',
        appointmentTime: '14:00',
      },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
    });
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
  });

  it('fails create_appointment safely when readiness has blocking issues before side effects', async () => {
    mockComputeOnboardingReadiness.mockResolvedValueOnce({
      ready: false,
      blockingIssues: [
        {
          code: 'GOOGLE_CALENDAR_INTEGRATION_MISSING',
          severity: 'blocking',
          area: 'calendar',
          message: 'Calendar is not connected.',
        },
      ],
      warnings: [],
      checkedAt: '2026-05-13T12:30:00.000Z',
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    });
    expect(mockGetClinicProfile).not.toHaveBeenCalled();
    expect(mockGetBookingRules).not.toHaveBeenCalled();
    expect(mockBookLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockSendAppointmentSms).not.toHaveBeenCalled();
    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        type: 'readiness_failure',
        source: 'onboarding_readiness',
        reasonCode: 'APPOINTMENT_TOOL_READINESS_BLOCKED',
      }),
    );
    const loggedPayload = JSON.stringify(mockLogger.warn.mock.calls);
    expect(loggedPayload).toContain('GOOGLE_CALENDAR_INTEGRATION_MISSING');
    expect(loggedPayload).toContain('create_appointment');
    expect(loggedPayload).toContain('2026-05-13T12:30:00.000Z');
    expect(loggedPayload).not.toContain('Jane Secret');
    expect(loggedPayload).not.toContain('+15551234567');
    expect(loggedPayload).not.toContain('1990-01-01');
    expect(loggedPayload).not.toContain('Cleaning');
  });

  it('fails cancel_appointment safely when readiness has blocking issues before cancel side effects', async () => {
    mockComputeOnboardingReadiness.mockResolvedValueOnce({
      ready: false,
      blockingIssues: [
        {
          code: 'TENANT_NOT_ACTIVE',
          severity: 'blocking',
          area: 'tenant',
          message: 'Tenant must be active before going live.',
        },
      ],
      warnings: [],
      checkedAt: '2026-05-13T12:31:00.000Z',
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      params: { eventId: 'google-event-a' },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    });
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
  });

  it('fails reschedule_appointment safely when readiness has blocking issues before reschedule side effects', async () => {
    mockComputeOnboardingReadiness.mockResolvedValueOnce({
      ready: false,
      blockingIssues: [
        {
          code: 'BOOKING_RULES_MISSING',
          severity: 'blocking',
          area: 'booking',
          message: 'Booking rules are required.',
        },
      ],
      warnings: [],
      checkedAt: '2026-05-13T12:32:00.000Z',
    });

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'reschedule_appointment',
      params: { eventId: 'google-event-a', startIso, endIso },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    });
    expect(mockGetClinicProfile).not.toHaveBeenCalled();
    expect(mockRescheduleLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
  });

  it('fails safely when readiness rejects cross-tenant access and does not leak raw details', async () => {
    mockComputeOnboardingReadiness.mockRejectedValueOnce(
      new Error('Cross-tenant access denied for Jane Secret +15551234567 token-secret'),
    );

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(result).toEqual({
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    });
    expect(mockBookLedgerBackedAppointment).not.toHaveBeenCalled();
    const loggedPayload = JSON.stringify(mockLogger.warn.mock.calls);
    expect(loggedPayload).toContain('create_appointment');
    expect(loggedPayload).toContain('Error');
    expect(loggedPayload).not.toContain('Cross-tenant access denied');
    expect(loggedPayload).not.toContain('Jane Secret');
    expect(loggedPayload).not.toContain('+15551234567');
    expect(loggedPayload).not.toContain('token-secret');
  });
});
