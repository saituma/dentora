import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockGetBookingRules = vi.hoisted(() => vi.fn());
const mockGetTenantSchedulingConfig = vi.hoisted(() => vi.fn());
const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockUpsertPatientProfile = vi.hoisted(() => vi.fn());
const mockListLedgerAvailabilityBlockers = vi.hoisted(() => vi.fn());
const mockCreateAppointmentHold = vi.hoisted(() => vi.fn());
const mockConfirmAppointmentHold = vi.hoisted(() => vi.fn());
const mockAttachExternalCalendarEvent = vi.hoisted(() => vi.fn());
const mockMarkAppointmentReconciliationNeeded = vi.hoisted(() => vi.fn());
const mockBeginAppointmentCancellationByExternalEventId = vi.hoisted(() => vi.fn());
const mockBeginAppointmentRescheduleByExternalEventId = vi.hoisted(() => vi.fn());
const mockMarkAppointmentExternalSyncState = vi.hoisted(() => vi.fn());
const mockCreateExternalEntityMapping = vi.hoisted(() => vi.fn());
const mockClientForTenant = vi.hoisted(() => vi.fn());

vi.mock('../../../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
  getBookingRules: mockGetBookingRules,
}));

vi.mock('../../services/tenant-scheduling-config.service.js', () => ({
  getTenantSchedulingConfig: mockGetTenantSchedulingConfig,
}));

vi.mock('../../../integrations/integration-registry.js', () => ({
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
}));

vi.mock('../../../patients/patients.service.js', () => ({
  upsertPatientProfile: mockUpsertPatientProfile,
}));

vi.mock('../../../appointments/appointment-ledger.service.js', () => ({
  listLedgerAvailabilityBlockers: mockListLedgerAvailabilityBlockers,
  createAppointmentHold: mockCreateAppointmentHold,
  confirmAppointmentHold: mockConfirmAppointmentHold,
  attachExternalCalendarEvent: mockAttachExternalCalendarEvent,
  markAppointmentReconciliationNeeded: mockMarkAppointmentReconciliationNeeded,
  beginAppointmentCancellationByExternalEventId: mockBeginAppointmentCancellationByExternalEventId,
  beginAppointmentRescheduleByExternalEventId: mockBeginAppointmentRescheduleByExternalEventId,
  markAppointmentExternalSyncState: mockMarkAppointmentExternalSyncState,
}));

vi.mock('../../services/external-entity-mapping.service.js', () => ({
  createExternalEntityMapping: mockCreateExternalEntityMapping,
}));

vi.mock('./dentally.client.js', () => ({
  DentallyClient: {
    forTenant: mockClientForTenant,
  },
}));

import { bookLedgerBackedAppointment } from '../../../appointments/appointment-application.service.js';
import type { DentallyAppointment, DentallyPatient } from './dentally.types.js';

interface MockDentallyClient {
  integrationId: string;
  listAppointments: Mock;
  listPatientsByPhone: Mock;
  createPatient: Mock;
  updatePatient: Mock;
  createAppointment: Mock;
  updateAppointment: Mock;
  cancelAppointment: Mock;
  validateCredentials: Mock;
  healthCheck: Mock;
}

const tenantId = 'tenant-a';
const integrationId = 'dentally-integration-a';
const startIso = '2026-06-01T09:00:00.000Z';
const endIso = '2026-06-01T09:30:00.000Z';

function patientFixture(): DentallyPatient {
  return {
    id: 'dentally-patient-a',
    full_name: 'Jane Secret',
    mobile: '+15551234567',
  };
}

function appointmentFixture(): DentallyAppointment {
  return {
    id: 'dentally-appointment-a',
    patient_id: 'dentally-patient-a',
    clinician_id: 'clinician-a',
    room_id: 'room-a',
    patient: patientFixture(),
    start_time: startIso,
    end_time: endIso,
    status: 'confirmed',
  };
}

function clientFixture(): MockDentallyClient {
  return {
    integrationId,
    listAppointments: vi.fn().mockResolvedValue([]),
    listPatientsByPhone: vi.fn().mockResolvedValue([]),
    createPatient: vi.fn().mockResolvedValue(patientFixture()),
    updatePatient: vi.fn().mockResolvedValue(patientFixture()),
    createAppointment: vi.fn().mockResolvedValue(appointmentFixture()),
    updateAppointment: vi.fn().mockResolvedValue(appointmentFixture()),
    cancelAppointment: vi.fn().mockResolvedValue(undefined),
    validateCredentials: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_DENTALLY = 'true';
  mockGetClinicProfile.mockResolvedValue({
    timezone: 'UTC',
    businessHours: null,
  });
  mockGetBookingRules.mockResolvedValue({
    defaultAppointmentDurationMinutes: 30,
    bufferBetweenAppointmentsMinutes: 0,
    operatingSchedule: {
      monday: { start: '09:00', end: '10:00' },
    },
    closedDates: [],
  });
  mockGetTenantSchedulingConfig.mockResolvedValue({
    tenantId,
    primaryProvider: 'dentally',
    primaryIntegrationId: integrationId,
    fallbackProvider: null,
    fallbackIntegrationId: null,
    sourceOfTruth: 'pms',
    googleSyncMode: 'fallback_only',
  });
  mockListLedgerAvailabilityBlockers.mockResolvedValue([]);
  mockUpsertPatientProfile.mockResolvedValue({ id: 'local-patient-a' });
  mockCreateAppointmentHold.mockResolvedValue({ id: 'hold-a' });
  mockConfirmAppointmentHold.mockResolvedValue({
    id: 'appointment-a',
    externalCalendarEventId: null,
  });
  mockCreateExternalEntityMapping.mockResolvedValue({ id: 'mapping-a' });
  mockClientForTenant.mockResolvedValue(clientFixture());
});

afterEach(() => {
  delete process.env.ENABLE_DENTALLY;
});

describe('AI receptionist booking path with Dentally', () => {
  it('routes appointment creation through resolver and Dentally adapter', async () => {
    const result = await bookLedgerBackedAppointment({
      tenantId,
      slot: { startIso, endIso },
      patient: {
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(mockGetTenantSchedulingConfig).toHaveBeenCalledWith(tenantId);
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
    expect(mockClientForTenant).toHaveBeenCalledWith({ tenantId, integrationId });
    expect(mockCreateAppointmentHold).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        patientId: 'local-patient-a',
        calendarIntegrationId: integrationId,
      }),
    );
    expect(mockAttachExternalCalendarEvent).toHaveBeenCalledWith({
      tenantId,
      appointmentId: 'appointment-a',
      externalCalendarEventId: 'dentally-appointment-a',
      externalProvider: 'dentally',
      externalAppointmentId: 'dentally-appointment-a',
      externalPatientId: 'dentally-patient-a',
      externalClinicianId: 'clinician-a',
      externalRoomId: 'room-a',
    });
    expect(mockCreateExternalEntityMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        localEntityType: 'appointment',
        localEntityId: 'appointment-a',
        externalProvider: 'dentally',
        externalEntityId: 'dentally-appointment-a',
        integrationId,
      }),
    );
    expect(result).toMatchObject({
      eventId: 'dentally-appointment-a',
      appointmentId: 'appointment-a',
      slot: { startIso, endIso },
    });
  });
});
