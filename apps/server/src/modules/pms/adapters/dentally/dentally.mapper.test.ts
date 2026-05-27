import { describe, expect, it } from 'vitest';
import {
  mapDentallyAppointment,
  mapDentallyAppointmentSummary,
  mapDentallyClinician,
  mapDentallyPatient,
  mapDentallyRoom,
  mapDentallyTreatmentType,
} from './dentally.mapper.js';
import { DentallyValidationError } from './dentally.errors.js';
import type {
  DentallyAppointment,
  DentallyClinician,
  DentallyPatient,
  DentallyRoom,
  DentallyTreatmentType,
} from './dentally.types.js';

describe('Dentally mapper', () => {
  it('maps Dentally patients into provider-neutral patients', () => {
    const patient: DentallyPatient = {
      id: 88771,
      first_name: 'Ada',
      last_name: 'Lovelace',
      mobile_phone: '+447700900123',
      date_of_birth: '1985-01-02',
    };

    expect(mapDentallyPatient(patient)).toEqual({
      id: '88771',
      externalId: '88771',
      fullName: 'Ada Lovelace',
      phoneNumber: '+447700900123',
      dateOfBirth: '1985-01-02',
    });
  });

  it('maps Dentally clinicians without leaking raw response shape', () => {
    const clinician: DentallyClinician = {
      id: 'clinician-12',
      first_name: 'Nina',
      last_name: 'Patel',
      role: 'dentist',
      active: true,
    };

    expect(mapDentallyClinician(clinician)).toEqual({
      id: 'clinician-12',
      externalId: 'clinician-12',
      displayName: 'Nina Patel',
      role: 'dentist',
      isActive: true,
    });
  });

  it('maps Dentally appointments into provider-neutral appointments and summaries', () => {
    const appointment: DentallyAppointment = {
      id: 'dentally-appointment-a',
      patient_id: 'dentally-patient-a',
      clinician_id: 'clinician-a',
      room_id: 'room-a',
      patient: {
        id: 'dentally-patient-a',
        full_name: 'Ada Lovelace',
        mobile: '+447700900123',
      },
      clinician: {
        id: 'clinician-a',
        name: 'Dr Patel',
      },
      room: {
        id: 'room-a',
        name: 'Surgery 1',
      },
      treatment: {
        id: 'treatment-a',
        name: 'Hygiene',
        code: 'HYG',
        duration: 30,
      },
      start_time: '2026-06-01T09:00:00.000Z',
      finish_time: '2026-06-01T09:30:00.000Z',
      status: 'confirmed',
      notes: 'First visit',
    };

    expect(
      mapDentallyAppointment(appointment, {
        tenantId: 'tenant-a',
        timezone: 'UTC',
        appAppointmentId: 'appointment-a',
      }),
    ).toMatchObject({
      id: 'dentally-appointment-a',
      tenantId: 'tenant-a',
      provider: 'dentally',
      appAppointmentId: 'appointment-a',
      externalPatientId: 'dentally-patient-a',
      externalClinicianId: 'clinician-a',
      externalRoomId: 'room-a',
      slot: {
        startIso: '2026-06-01T09:00:00.000Z',
        endIso: '2026-06-01T09:30:00.000Z',
      },
      patient: {
        externalId: 'dentally-patient-a',
        fullName: 'Ada Lovelace',
      },
    });

    expect(mapDentallyAppointmentSummary(appointment, 'UTC')).toMatchObject({
      id: 'dentally-appointment-a',
      provider: 'dentally',
      summary: 'Dentally appointment - Ada Lovelace',
      description: 'First visit',
      startIso: '2026-06-01T09:00:00.000Z',
      endIso: '2026-06-01T09:30:00.000Z',
      status: 'confirmed',
    });
  });

  it('validates required patient fields and ignores unknown fields', () => {
    const patient: DentallyPatient = {
      id: 88772,
      first_name: 'Grace',
      last_name: 'Hopper',
      home_phone: null,
      work_phone: '+447700900999',
      email_address: 'ignored@example.test',
    };

    expect(mapDentallyPatient(patient)).toMatchObject({
      id: '88772',
      fullName: 'Grace Hopper',
      phoneNumber: '+447700900999',
    });

    expect(() =>
      mapDentallyPatient({
        id: '',
        first_name: 'No',
        last_name: 'Id',
      }),
    ).toThrow(DentallyValidationError);
  });

  it('validates appointment time fields before mapping provider-neutral slots', () => {
    expect(() =>
      mapDentallyAppointmentSummary(
        {
          id: 'appointment-a',
          patient_id: 'patient-a',
          start_time: 'not-a-date',
          finish_time: '2026-06-01T09:30:00.000Z',
        },
        'UTC',
      ),
    ).toThrow(DentallyValidationError);

    expect(() =>
      mapDentallyAppointmentSummary(
        {
          id: 'appointment-a',
          patient_id: 'patient-a',
          start_time: '2026-06-01T09:30:00.000Z',
          finish_time: '2026-06-01T09:00:00.000Z',
        },
        'UTC',
      ),
    ).toThrow(DentallyValidationError);
  });

  it('maps clinician, room, and treatment shapes without leaking raw provider fields', () => {
    const room: DentallyRoom = {
      id: 'room-a',
      name: 'Surgery 1',
      active: null,
    };
    const treatment: DentallyTreatmentType = {
      id: 31,
      nomenclature: 'Examination',
      duration: null,
      active: null,
    };

    expect(mapDentallyRoom(room)).toEqual({
      id: 'room-a',
      externalId: 'room-a',
      name: 'Surgery 1',
      isActive: true,
    });
    expect(mapDentallyTreatmentType(treatment)).toEqual({
      id: '31',
      externalId: '31',
      name: 'Examination',
      code: undefined,
      durationMinutes: undefined,
      isActive: true,
    });
    expect(() => mapDentallyRoom({ id: 'room-b', name: null })).toThrow(DentallyValidationError);
    expect(() => mapDentallyClinician({ id: 'clinician-b', name: null })).toThrow(
      DentallyValidationError,
    );
  });
});
