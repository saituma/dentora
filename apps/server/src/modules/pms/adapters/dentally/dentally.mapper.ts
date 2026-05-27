import type {
  Appointment,
  ExternalAppointmentSummary,
  Slot,
} from '../../domain/appointment.types.js';
import type { Clinician } from '../../domain/clinician.types.js';
import type { Patient } from '../../domain/patient.types.js';
import type { Room } from '../../domain/room.types.js';
import { DentallyValidationError } from './dentally.errors.js';
import {
  type DentallyAppointment,
  type DentallyClinician,
  type DentallyMappedAppointmentRelations,
  type DentallyPatient,
  type DentallyRoom,
  type DentallyTreatmentType,
  type LocalTreatmentType,
} from './dentally.types.js';

function stringId(value: string | number | null | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function optionalString(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function fullNameFromParts(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  fullName?: string | null;
}): string | undefined {
  const direct = optionalString(input.fullName) ?? optionalString(input.name);
  if (direct) return direct;
  const parts = [input.firstName, input.lastName]
    .map((part) => optionalString(part))
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function startIsoFromAppointment(appointment: DentallyAppointment): string {
  return (
    optionalString(appointment.start_time) ??
    optionalString(appointment.start_at) ??
    optionalString(appointment.start) ??
    ''
  );
}

function endIsoFromAppointment(appointment: DentallyAppointment): string {
  const explicit =
    optionalString(appointment.finish_time) ??
    optionalString(appointment.end_time) ??
    optionalString(appointment.end_at) ??
    optionalString(appointment.end);
  if (explicit) return explicit;

  const startIso = startIsoFromAppointment(appointment);
  const durationMinutes =
    typeof appointment.duration === 'number' && Number.isFinite(appointment.duration)
      ? appointment.duration
      : null;
  if (!durationMinutes) return '';
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return '';
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

function requireStringId(value: string | number | null | undefined, label: string): string {
  const id = stringId(value);
  if (!id) {
    throw new DentallyValidationError(`Dentally ${label} is missing required id`);
  }
  return id;
}

function requireOptional(value: string | undefined, label: string): string {
  if (!value) {
    throw new DentallyValidationError(`Dentally ${label} is missing required field`);
  }
  return value;
}

function requireValidIso(value: string, label: string): string {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw new DentallyValidationError(`Dentally appointment has invalid ${label}`);
  }
  return value;
}

function slotLabel(startIso: string, timezone: string): string {
  const date = new Date(startIso);
  if (!Number.isFinite(date.getTime())) return startIso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function mapDentallyPatient(patient: DentallyPatient): Patient {
  const externalId = requireStringId(patient.id, 'patient');
  const fullName = requireOptional(
    fullNameFromParts({
      firstName: patient.first_name,
      lastName: patient.last_name,
      name: patient.name,
      fullName: patient.full_name,
    }),
    'patient name',
  );
  return {
    id: externalId,
    externalId,
    fullName,
    phoneNumber:
      optionalString(patient.mobile_phone) ??
      optionalString(patient.home_phone) ??
      optionalString(patient.work_phone) ??
      optionalString(patient.mobile) ??
      optionalString(patient.phone) ??
      optionalString(patient.telephone) ??
      '',
    dateOfBirth: optionalString(patient.date_of_birth) ?? optionalString(patient.dob) ?? null,
  };
}

export function mapDentallyClinician(clinician: DentallyClinician): Clinician {
  const externalId = requireStringId(clinician.id, 'clinician');
  const displayName = requireOptional(
    fullNameFromParts({
      firstName: clinician.first_name,
      lastName: clinician.last_name,
      name: clinician.name,
    }),
    'clinician name',
  );
  return {
    id: externalId,
    externalId,
    displayName,
    role: optionalString(clinician.role),
    isActive: clinician.active !== false,
  };
}

export function mapDentallyRoom(room: DentallyRoom): Room {
  const externalId = requireStringId(room.id, 'room');
  return {
    id: externalId,
    externalId,
    name: requireOptional(optionalString(room.name), 'room name'),
    isActive: room.active !== false,
  };
}

export function mapDentallyTreatmentType(treatment: DentallyTreatmentType): LocalTreatmentType {
  const externalId = requireStringId(treatment.id, 'treatment');
  return {
    id: externalId,
    externalId,
    name: requireOptional(
      optionalString(treatment.name) ??
        optionalString(treatment.nomenclature) ??
        optionalString(treatment.patient_nomenclature),
      'treatment name',
    ),
    code: optionalString(treatment.code) ?? stringId(treatment.treatment_category_id),
    durationMinutes:
      typeof treatment.duration === 'number' && Number.isFinite(treatment.duration)
        ? treatment.duration
        : undefined,
    isActive: treatment.active !== false,
  };
}

export function mapDentallyAppointmentRelations(
  appointment: DentallyAppointment,
): DentallyMappedAppointmentRelations {
  return {
    clinician: appointment.clinician
      ? mapDentallyClinician(appointment.clinician)
      : appointment.practitioner
        ? mapDentallyClinician(appointment.practitioner)
        : undefined,
    room: appointment.room ? mapDentallyRoom(appointment.room) : undefined,
    treatmentType: appointment.treatment
      ? mapDentallyTreatmentType(appointment.treatment)
      : undefined,
  };
}

export function mapDentallyAppointmentToSlot(
  appointment: DentallyAppointment,
  timezone: string,
): Slot {
  const startIso = requireValidIso(startIsoFromAppointment(appointment), 'start time');
  const endIso = requireValidIso(endIsoFromAppointment(appointment), 'finish time');
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    throw new DentallyValidationError('Dentally appointment finish time must be after start time');
  }
  return {
    startIso,
    endIso,
    label: slotLabel(startIso, timezone),
  };
}

export function mapDentallyAppointment(
  appointment: DentallyAppointment,
  input: {
    tenantId: string;
    timezone: string;
    appAppointmentId?: string;
  },
): Appointment {
  const relations = mapDentallyAppointmentRelations(appointment);
  const externalAppointmentId = requireStringId(appointment.id, 'appointment');
  const externalPatientId = stringId(appointment.patient_id) ?? stringId(appointment.patient?.id);
  return {
    id: externalAppointmentId,
    tenantId: input.tenantId,
    provider: 'dentally',
    slot: mapDentallyAppointmentToSlot(appointment, input.timezone),
    patient: appointment.patient ? mapDentallyPatient(appointment.patient) : undefined,
    appAppointmentId: input.appAppointmentId,
    externalPatientId,
    externalClinicianId:
      stringId(appointment.clinician_id) ??
      stringId(appointment.practitioner_id) ??
      relations.clinician?.externalId,
    externalRoomId: stringId(appointment.room_id) ?? relations.room?.externalId,
  };
}

export function mapDentallyAppointmentSummary(
  appointment: DentallyAppointment,
  timezone: string,
): ExternalAppointmentSummary {
  const slot = mapDentallyAppointmentToSlot(appointment, timezone);
  const patientName = appointment.patient
    ? mapDentallyPatient(appointment.patient).fullName
    : (optionalString(appointment.patient_name) ?? null);
  return {
    id: requireStringId(appointment.id, 'appointment'),
    provider: 'dentally',
    summary: patientName ? `Dentally appointment - ${patientName}` : 'Dentally appointment',
    description:
      optionalString(appointment.reason) ??
      optionalString(appointment.treatment_description) ??
      optionalString(appointment.notes),
    startIso: slot.startIso,
    endIso: slot.endIso,
    status:
      appointment.cancelled || appointment.cancelled_at
        ? 'cancelled'
        : (optionalString(appointment.state) ?? optionalString(appointment.status) ?? 'confirmed'),
  };
}
