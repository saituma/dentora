import * as configService from '../config/config.service.js';
import {
  findAvailableCalendarSlots,
  createGoogleCalendarAppointment,
  getActiveGoogleCalendarIntegration,
  cancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment,
} from '../integrations/integration.service.js';
import { resolveValidGoogleAccessToken } from '../integrations/google-calendar.shared.js';
import { findPatientProfile, upsertPatientProfile } from '../patients/patients.service.js';
import { forwardCallToHuman, sendAppointmentSms } from './telephony.service.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

function getTodayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeAgentDate(dateStr: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const today = getTodayInTimezone(timezone);
  if (dateStr >= today) return dateStr;
  const currentYear = Number(today.slice(0, 4));
  const agentYear = Number(dateStr.slice(0, 4));
  if (agentYear < currentYear) {
    const corrected = `${currentYear}${dateStr.slice(4)}`;
    if (corrected >= today) {
      logger.warn({ original: dateStr, corrected }, 'Corrected agent-supplied date to current year');
      return corrected;
    }
    const nextYear = `${currentYear + 1}${dateStr.slice(4)}`;
    logger.warn({ original: dateStr, corrected: nextYear }, 'Corrected agent-supplied date to next year');
    return nextYear;
  }
  return dateStr;
}

function normalizeAgentIso(isoStr: string, timezone: string): string {
  const parsed = new Date(isoStr);
  if (!Number.isFinite(parsed.getTime())) return isoStr;
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
  const today = getTodayInTimezone(timezone);
  if (localDate >= today) return isoStr;
  const currentYear = Number(today.slice(0, 4));
  const agentYear = parsed.getUTCFullYear();
  if (agentYear < currentYear) {
    const diff = currentYear - agentYear;
    const corrected = new Date(parsed);
    corrected.setUTCFullYear(parsed.getUTCFullYear() + diff);
    const correctedLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(corrected);
    if (correctedLocal < today) {
      corrected.setUTCFullYear(corrected.getUTCFullYear() + 1);
    }
    logger.warn({ original: isoStr, corrected: corrected.toISOString() }, 'Corrected agent-supplied ISO date to current year');
    return corrected.toISOString();
  }
  return isoStr;
}

export async function handleConvaiToolCall(input: {
  tenantId: string;
  toolName: string;
  params: Record<string, unknown>;
  callSid?: string;
  callSessionId?: string;
}): Promise<unknown> {
  const { tenantId, toolName, params } = input;
  logger.info({ tenantId, toolName, params, callSessionId: input.callSessionId }, 'ConvAI tool call received');

  switch (toolName) {
    case 'list_appointments':
      return listAppointments(tenantId);
    case 'lookup_patient':
      return lookupPatient(tenantId, params);
    case 'check_availability':
      return checkAvailability(tenantId, params);
    case 'create_appointment':
      return createAppointmentWithSms(tenantId, params);
    case 'cancel_appointment':
      return cancelAppointment(tenantId, params);
    case 'reschedule_appointment':
      return rescheduleAppointment(tenantId, params);
    case 'forward_call':
      return forwardCall(tenantId, params, input.callSid, input.callSessionId);
    case 'get_clinic_info':
      return getClinicInfo(tenantId);
    case 'get_business_hours':
      return getBusinessHours(tenantId);
    default:
      throw new ValidationError(`Unknown tool: ${toolName}`);
  }
}

async function listAppointments(tenantId: string) {
  const integration = await getActiveGoogleCalendarIntegration(tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const calendarId = typeof config.calendarId === 'string' && config.calendarId.trim()
    ? config.calendarId
    : 'primary';

  const lookAheadDays = 7;
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ValidationError(`Failed to load calendar events: ${errorBody.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    items?: Array<{
      id?: string;
      summary?: string;
      description?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      status?: string;
    }>;
  };

  return {
    calendarId,
    events: (payload.items ?? []).map((event) => ({
      id: event.id ?? '',
      summary: event.summary ?? 'Appointment',
      description: event.description ?? '',
      htmlLink: event.htmlLink,
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      status: event.status ?? 'confirmed',
    })),
  };
}

async function lookupPatient(tenantId: string, params: Record<string, unknown>) {
  const phoneNumber = String(params.phoneNumber ?? '').trim();
  const dateOfBirth = String(params.dateOfBirth ?? '').trim();
  if (!phoneNumber || !dateOfBirth) {
    throw new ValidationError('phoneNumber and dateOfBirth are required');
  }

  const profile = await findPatientProfile({ tenantId, phoneNumber, dateOfBirth });
  return profile ?? null;
}

async function checkAvailability(tenantId: string, params: Record<string, unknown>) {
  const clinic = await configService.getClinicProfile(tenantId);
  const rules = await configService.getBookingRules(tenantId);

  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to check availability');
  }

  const closedDates = Array.isArray(rules?.closedDates)
    ? rules?.closedDates.filter((value): value is string => typeof value === 'string')
    : null;

  const rawRequestedDate = String(params.requestedDate ?? '').trim();
  if (!rawRequestedDate) {
    throw new ValidationError('requestedDate is required');
  }
  const requestedDate = normalizeAgentDate(rawRequestedDate, clinic.timezone);

  const availability = await findAvailableCalendarSlots({
    tenantId,
    timezone: clinic.timezone,
    requestedDate,
    requestedTime: params.requestedTime ? String(params.requestedTime) : null,
    requestedPeriod: params.requestedPeriod ? String(params.requestedPeriod) as 'morning' | 'afternoon' | 'evening' : null,
    appointmentDurationMinutes: params.appointmentDurationMinutes
      ? Number(params.appointmentDurationMinutes)
      : rules?.defaultAppointmentDurationMinutes ?? 30,
    bufferBetweenAppointmentsMinutes: rules?.bufferBetweenAppointmentsMinutes ?? 0,
    operatingSchedule: (rules?.operatingSchedule as Record<string, unknown> | null) ?? (clinic.businessHours as Record<string, unknown> | null) ?? null,
    closedDates,
    maxSlots: params.maxSlots ? Number(params.maxSlots) : 5,
    lookAheadDays: params.lookAheadDays ? Number(params.lookAheadDays) : 14,
  });

  return {
    exactMatch: availability.exactMatch,
    suggestedSlots: availability.suggestedSlots,
    timezone: clinic.timezone,
  };
}

async function createAppointmentWithSms(tenantId: string, params: Record<string, unknown>) {
  const clinic = await configService.getClinicProfile(tenantId);
  const rules = await configService.getBookingRules(tenantId);

  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to book appointments');
  }

  const rawStartIso = String(params.startIso ?? '').trim();
  const rawEndIso = String(params.endIso ?? '').trim();
  const fullName = String(params.fullName ?? '').trim();
  const phoneNumber = String(params.phoneNumber ?? '').trim();
  const reasonForVisit = String(params.reasonForVisit ?? '').trim();
  const dateOfBirth = params.dateOfBirth ? String(params.dateOfBirth) : null;
  const age = params.age ? Number(params.age) : undefined;

  if (!rawStartIso || !rawEndIso || !fullName || !phoneNumber || !reasonForVisit) {
    throw new ValidationError('startIso, endIso, fullName, phoneNumber, and reasonForVisit are required');
  }

  const startIso = normalizeAgentIso(rawStartIso, clinic.timezone);
  const endIso = normalizeAgentIso(rawEndIso, clinic.timezone);

  const startAt = new Date(startIso);
  const endAt = new Date(endIso);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    throw new ValidationError('Appointment start/end times are invalid');
  }

  const now = Date.now();
  const minNoticeHours = rules?.minNoticePeriodHours ?? 2;
  const maxAdvanceDays = rules?.maxAdvanceBookingDays ?? 30;
  const minStart = now + minNoticeHours * 60 * 60 * 1000;
  const maxStart = now + maxAdvanceDays * 24 * 60 * 60 * 1000;

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: clinic.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: clinic.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const startDateLocal = dateFormatter.format(startAt);
  const todayLocal = dateFormatter.format(new Date());
  const tomorrowLocal = dateFormatter.format(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const isToday = startDateLocal === todayLocal;
  const isTomorrow = startDateLocal === tomorrowLocal;

  const nowHour = Number(timeFormatter.formatToParts(new Date()).find((part) => part.type === 'hour')?.value ?? '0');
  const startHour = Number(timeFormatter.formatToParts(startAt).find((part) => part.type === 'hour')?.value ?? '0');

  const reason = reasonForVisit.toLowerCase();
  const isEmergency = /\b(emergency|severe|bleeding|trauma|swelling|broken|abscess|infection|fever|uncontrolled)\b/.test(reason);

  if (!isEmergency) {
    if (startAt.getTime() < minStart) {
      throw new ValidationError(`Appointments must be scheduled at least ${minNoticeHours} hours in advance`);
    }
    if (startAt.getTime() > maxStart) {
      throw new ValidationError(`Appointments cannot be scheduled more than ${maxAdvanceDays} days in advance`);
    }

    if (isToday) {
      if (nowHour >= 12) {
        throw new ValidationError('Same-day appointments are only available when booked in the morning');
      }
      if (startHour < 12) {
        throw new ValidationError('Same-day appointments must be scheduled in the afternoon');
      }
    } else if (!isTomorrow) {
      // No additional constraints
    }
  }

  const appointment = await createGoogleCalendarAppointment({
    tenantId,
    timezone: clinic.timezone,
    slot: { startIso, endIso },
    summary: `Dental appointment - ${fullName}`,
    patient: {
      fullName,
      age,
      phoneNumber,
      dateOfBirth,
      reasonForVisit,
    },
  });

  await upsertPatientProfile({
    tenantId,
    fullName,
    phoneNumber,
    dateOfBirth,
    lastVisitAt: new Date(startIso),
    notes: reasonForVisit,
  });

  const startDate = new Intl.DateTimeFormat('en-US', {
    timeZone: clinic.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));

  sendAppointmentSms({
    tenantId,
    to: phoneNumber,
    clinicName: clinic.clinicName ?? 'Dental Clinic',
    appointmentDate: startDate,
    patientName: fullName,
  }).catch((err) => {
    logger.warn({ err, tenantId }, 'SMS confirmation failed (non-blocking)');
  });

  return appointment;
}

async function cancelAppointment(tenantId: string, params: Record<string, unknown>) {
  const eventId = String(params.eventId ?? '').trim();
  if (!eventId) {
    throw new ValidationError('eventId is required');
  }

  await cancelGoogleCalendarAppointment({ tenantId, eventId });
  return { success: true };
}

async function rescheduleAppointment(tenantId: string, params: Record<string, unknown>) {
  const eventId = String(params.eventId ?? '').trim();
  const rawStartIso = String(params.startIso ?? '').trim();
  const rawEndIso = String(params.endIso ?? '').trim();

  if (!eventId || !rawStartIso || !rawEndIso) {
    throw new ValidationError('eventId, startIso, and endIso are required');
  }

  const clinic = await configService.getClinicProfile(tenantId);
  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to reschedule appointments');
  }

  const startIso = normalizeAgentIso(rawStartIso, clinic.timezone);
  const endIso = normalizeAgentIso(rawEndIso, clinic.timezone);

  return await rescheduleGoogleCalendarAppointment({
    tenantId,
    eventId,
    timezone: clinic.timezone,
    slot: { startIso, endIso },
  });
}

async function forwardCall(
  tenantId: string,
  params: Record<string, unknown>,
  callSid?: string,
  callSessionId?: string,
) {
  if (!callSid || !callSessionId) {
    return { success: false, message: 'Call forwarding is only available during live phone calls.' };
  }

  let targetNumber = String(params.targetNumber ?? '').trim();

  if (!targetNumber) {
    const clinic = await configService.getClinicProfile(tenantId);
    const staffMembers = clinic?.staffMembers as Array<{ name?: string; phone?: string; role?: string }> | undefined;

    const staffName = String(params.staffName ?? '').trim().toLowerCase();
    const staffMatch = staffMembers?.find((s) =>
      s.phone && (
        !staffName ||
        s.name?.toLowerCase().includes(staffName) ||
        s.role?.toLowerCase().includes(staffName)
      ),
    );

    if (staffMatch?.phone) {
      targetNumber = staffMatch.phone;
    } else {
      const clinicPhone = clinic?.phone ?? (clinic as Record<string, unknown>)?.primaryPhone as string | undefined;
      if (clinicPhone) {
        targetNumber = clinicPhone;
      }
    }
  }

  if (!targetNumber) {
    return { success: false, message: 'No phone number available to forward the call to. Please take a message instead.' };
  }

  const result = await forwardCallToHuman({
    tenantId,
    callSid,
    targetNumber,
    callSessionId,
  });

  if (result.success) {
    return { success: true, message: `Transferring the call to ${targetNumber}. The caller will hear hold music.` };
  }

  return { success: false, message: 'Unable to transfer the call right now. Please take a message and let the caller know someone will call them back.' };
}

async function getClinicInfo(tenantId: string) {
  const clinic = await configService.getClinicProfile(tenantId);
  const policyList = await configService.getPolicies(tenantId);
  const faqList = await configService.getFaqs(tenantId);

  return {
    name: clinic?.clinicName ?? 'Dental Clinic',
    phone: clinic?.phone ?? (clinic as Record<string, unknown>)?.primaryPhone ?? null,
    email: clinic?.email ?? (clinic as Record<string, unknown>)?.supportEmail ?? null,
    address: clinic?.address ?? null,
    website: clinic?.website ?? null,
    specialties: clinic?.specialties ?? [],
    staffMembers: (clinic?.staffMembers as Array<{ name?: string; role?: string; phone?: string }> | undefined)?.map(
      (s) => ({ name: s.name, role: s.role, phone: s.phone ?? null }),
    ) ?? [],
    policies: policyList?.map((p) => ({
      type: (p as Record<string, unknown>).policyType,
      content: (p as Record<string, unknown>).content,
    })) ?? [],
    faqs: faqList?.map((f) => ({
      question: (f as Record<string, unknown>).question,
      answer: (f as Record<string, unknown>).answer,
    })) ?? [],
  };
}

async function getBusinessHours(tenantId: string) {
  const clinic = await configService.getClinicProfile(tenantId);
  const rules = await configService.getBookingRules(tenantId);
  const timezone = clinic?.timezone ?? 'America/New_York';

  const schedule = (rules as Record<string, unknown> | null)?.operatingSchedule
    ?? clinic?.businessHours
    ?? null;

  return {
    timezone,
    schedule,
    closedDates: (rules as Record<string, unknown> | null)?.closedDates ?? [],
  };
}
