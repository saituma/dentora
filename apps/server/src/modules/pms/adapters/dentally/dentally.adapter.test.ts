import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockClientForTenant = vi.hoisted(() => vi.fn());
const mockListLedgerAvailabilityBlockers = vi.hoisted(() => vi.fn());
const mockCreateExternalEntityMapping = vi.hoisted(() => vi.fn());

vi.mock('./dentally.client.js', () => ({
  DentallyClient: {
    forTenant: mockClientForTenant,
  },
}));

vi.mock('../../../appointments/appointment-ledger.service.js', () => ({
  listLedgerAvailabilityBlockers: mockListLedgerAvailabilityBlockers,
}));

vi.mock('../../services/external-entity-mapping.service.js', () => ({
  createExternalEntityMapping: mockCreateExternalEntityMapping,
}));

import { DentallySchedulingProvider } from './dentally.adapter.js';
import type { DentallyAppointment, DentallyPatient } from './dentally.types.js';

interface MockDentallyClient {
  integrationId: string;
  listAppointments: Mock;
  createAppointment: Mock;
  cancelAppointment: Mock;
  updateAppointment: Mock;
  listPatientsByPhone: Mock;
  createPatient: Mock;
  updatePatient: Mock;
  validateCredentials: Mock;
  healthCheck: Mock;
}

const tenantId = 'tenant-a';
const integrationId = 'dentally-integration-a';
const startIso = '2026-06-01T09:00:00.000Z';
const endIso = '2026-06-01T09:30:00.000Z';
const slot = { startIso, endIso };

function patientFixture(input: Partial<DentallyPatient> = {}): DentallyPatient {
  return {
    id: input.id ?? 'dentally-patient-a',
    full_name: input.full_name ?? 'Jane Secret',
    mobile: input.mobile ?? '+15551234567',
    date_of_birth: input.date_of_birth ?? '1985-01-02',
  };
}

function appointmentFixture(input: Partial<DentallyAppointment> = {}): DentallyAppointment {
  return {
    id: input.id ?? 'dentally-appointment-a',
    patient_id: input.patient_id ?? 'dentally-patient-a',
    clinician_id: input.clinician_id ?? 'clinician-a',
    room_id: input.room_id ?? 'room-a',
    patient: input.patient === undefined ? patientFixture() : input.patient,
    start_time: input.start_time ?? startIso,
    end_time: input.end_time ?? endIso,
    status: input.status ?? 'confirmed',
    cancelled: input.cancelled ?? false,
  };
}

function clientFixture(overrides: Partial<MockDentallyClient> = {}): MockDentallyClient {
  return {
    integrationId,
    listAppointments: vi.fn().mockResolvedValue([]),
    createAppointment: vi.fn().mockResolvedValue(appointmentFixture()),
    cancelAppointment: vi.fn().mockResolvedValue(undefined),
    updateAppointment: vi.fn().mockResolvedValue(appointmentFixture()),
    listPatientsByPhone: vi.fn().mockResolvedValue([]),
    createPatient: vi.fn().mockResolvedValue(patientFixture()),
    updatePatient: vi.fn().mockResolvedValue(patientFixture()),
    validateCredentials: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListLedgerAvailabilityBlockers.mockResolvedValue([]);
  mockCreateExternalEntityMapping.mockResolvedValue({ id: 'mapping-a' });
});

describe('DentallySchedulingProvider', () => {
  it('checks availability using Dentally appointments and the local ledger', async () => {
    const client = clientFixture({
      listAppointments: vi.fn().mockResolvedValue([
        appointmentFixture({
          id: 'busy-a',
          start_time: '2026-06-01T09:00:00.000Z',
          end_time: '2026-06-01T09:30:00.000Z',
        }),
      ]),
    });
    mockClientForTenant.mockResolvedValue(client);
    const provider = new DentallySchedulingProvider({ tenantId, integrationId });

    const slots = await provider.getAvailability({
      tenantId,
      timezone: 'UTC',
      requestedDate: '2026-06-01',
      appointmentDurationMinutes: 30,
      operatingSchedule: {
        monday: { start: '09:00', end: '10:00' },
      },
      maxSlots: 2,
      lookAheadDays: 1,
    });

    expect(mockClientForTenant).toHaveBeenCalledWith({ tenantId, integrationId });
    expect(client.listAppointments).toHaveBeenCalledWith({
      startIso: '2026-06-01T00:00:00.000Z',
      endIso: '2026-06-02T00:00:00.000Z',
      limit: 250,
    });
    expect(mockListLedgerAvailabilityBlockers).toHaveBeenCalledWith({
      tenantId,
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      startIso: '2026-06-01T09:30:00.000Z',
      endIso: '2026-06-01T10:00:00.000Z',
    });
  });

  it('books through Dentally and records an external appointment mapping', async () => {
    const client = clientFixture();
    mockClientForTenant.mockResolvedValue(client);
    const provider = new DentallySchedulingProvider({ tenantId, integrationId });

    const appointment = await provider.createAppointment({
      tenantId,
      timezone: 'UTC',
      appAppointmentId: 'appointment-a',
      slot,
      summary: 'Dental appointment - Jane Secret',
      patient: {
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
        dateOfBirth: '1985-01-02',
      },
    });

    expect(client.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        preferred_name: 'Jane Secret',
        home_phone: '+15551234567',
        mobile_phone: '+15551234567',
        date_of_birth: '1985-01-02',
      }),
    );
    expect(client.createAppointment).toHaveBeenCalledWith({
      patient_id: 'dentally-patient-a',
      start_time: startIso,
      finish_time: endIso,
      reason: 'Cleaning',
      notes: 'Dental appointment - Jane Secret',
    });
    expect(mockCreateExternalEntityMapping).toHaveBeenCalledWith({
      tenantId,
      localEntityType: 'appointment',
      localEntityId: 'appointment-a',
      externalProvider: 'dentally',
      externalEntityType: 'appointment',
      externalEntityId: 'dentally-appointment-a',
      integrationId,
      metadata: { externalPatientId: 'dentally-patient-a' },
    });
    expect(appointment).toMatchObject({
      id: 'dentally-appointment-a',
      provider: 'dentally',
      externalPatientId: 'dentally-patient-a',
      externalClinicianId: 'clinician-a',
      externalRoomId: 'room-a',
      patient: { externalId: 'dentally-patient-a' },
    });
  });

  it('cancels through Dentally', async () => {
    const client = clientFixture();
    mockClientForTenant.mockResolvedValue(client);
    const provider = new DentallySchedulingProvider({ tenantId, integrationId });

    await provider.cancelAppointment('dentally-appointment-a');

    expect(client.cancelAppointment).toHaveBeenCalledWith('dentally-appointment-a');
  });

  it('reschedules through Dentally and records the external mapping', async () => {
    const client = clientFixture({
      updateAppointment: vi.fn().mockResolvedValue(
        appointmentFixture({
          start_time: '2026-06-02T10:00:00.000Z',
          end_time: '2026-06-02T10:30:00.000Z',
        }),
      ),
    });
    mockClientForTenant.mockResolvedValue(client);
    const provider = new DentallySchedulingProvider({ tenantId, integrationId });

    const appointment = await provider.rescheduleAppointment('dentally-appointment-a', {
      tenantId,
      timezone: 'UTC',
      appAppointmentId: 'appointment-a',
      slot: {
        startIso: '2026-06-02T10:00:00.000Z',
        endIso: '2026-06-02T10:30:00.000Z',
      },
    });

    expect(client.updateAppointment).toHaveBeenCalledWith('dentally-appointment-a', {
      start_time: '2026-06-02T10:00:00.000Z',
      finish_time: '2026-06-02T10:30:00.000Z',
    });
    expect(mockCreateExternalEntityMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProvider: 'dentally',
        externalEntityId: 'dentally-appointment-a',
        integrationId,
        metadata: { operation: 'reschedule' },
      }),
    );
    expect(appointment.slot).toMatchObject({
      startIso: '2026-06-02T10:00:00.000Z',
      endIso: '2026-06-02T10:30:00.000Z',
    });
  });

  it('finds patients by phone through Dentally', async () => {
    const client = clientFixture({
      listPatientsByPhone: vi.fn().mockResolvedValue([
        patientFixture({
          id: 'dentally-patient-b',
          full_name: 'Ravi Shah',
          mobile: '+15557654321',
        }),
      ]),
    });
    mockClientForTenant.mockResolvedValue(client);
    const provider = new DentallySchedulingProvider({ tenantId, integrationId });

    await expect(provider.findPatient('+15557654321')).resolves.toMatchObject({
      id: 'dentally-patient-b',
      externalId: 'dentally-patient-b',
      fullName: 'Ravi Shah',
      phoneNumber: '+15557654321',
    });
  });

  it('validates credentials and health through Dentally', async () => {
    const client = clientFixture();
    mockClientForTenant.mockResolvedValue(client);
    const provider = new DentallySchedulingProvider({ tenantId, integrationId });

    await expect(provider.validateCredentials()).resolves.toBeUndefined();
    await expect(provider.healthCheck()).resolves.toMatchObject({
      provider: 'dentally',
      healthy: true,
    });
    expect(client.validateCredentials).toHaveBeenCalledTimes(1);
    expect(client.healthCheck).toHaveBeenCalledTimes(1);
  });
});
