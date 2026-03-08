import { logger } from '../../lib/logger.js';
import {
  createGoogleCalendarAppointment,
  findAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration,
  type CalendarSlot,
} from '../integrations/integration.service.js';
import { executeLlmWithFailover } from './engine/index.js';
import {
  processConversationTurn,
  type TenantAIContext,
} from './ai.service.js';

type BookingStatus =
  | 'idle'
  | 'collecting_preference'
  | 'offering_slots'
  | 'collecting_patient'
  | 'awaiting_confirmation'
  | 'confirmed';

type RequestedPeriod = 'morning' | 'afternoon' | 'evening';

export interface PatientBookingDetails {
  fullName?: string;
  age?: number;
  phoneNumber?: string;
  reasonForVisit?: string;
}

export interface BookingConversationState {
  active: boolean;
  status: BookingStatus;
  serviceName?: string;
  requestedDate?: string;
  requestedTime?: string;
  requestedPeriod?: RequestedPeriod;
  offeredSlots: CalendarSlot[];
  selectedSlot?: CalendarSlot;
  patient: PatientBookingDetails;
  confirmationRequested: boolean;
  eventId?: string;
}

export interface ReceptionistSessionState {
  booking: BookingConversationState;
}

interface BookingTurnExtraction {
  bookingIntent: boolean;
  availabilityIntent: boolean;
  serviceName?: string;
  requestedDate?: string;
  requestedTime?: string;
  requestedPeriod?: RequestedPeriod;
  selectedSlotIndex?: number;
  selectedSlotStartIso?: string;
  confirmed: boolean;
  declined: boolean;
  patient: PatientBookingDetails;
}

const BOOKING_KEYWORDS = /\b(book|booking|schedule|appointment|available|availability|come in|see the dentist|reserve)\b/i;

function createEmptyBookingState(): BookingConversationState {
  return {
    active: false,
    status: 'idle',
    offeredSlots: [],
    patient: {},
    confirmationRequested: false,
  };
}

export function createInitialReceptionistSessionState(): ReceptionistSessionState {
  return {
    booking: createEmptyBookingState(),
  };
}

function ensureSessionState(state?: ReceptionistSessionState): ReceptionistSessionState {
  return {
    booking: {
      ...createEmptyBookingState(),
      ...(state?.booking ?? {}),
      offeredSlots: state?.booking?.offeredSlots ?? [],
      patient: {
        ...createEmptyBookingState().patient,
        ...(state?.booking?.patient ?? {}),
      },
    },
  };
}

function formatTodayForPrompt(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(new Date());
}

function normalizeJsonBlock(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found');
  }
  return raw.slice(start, end + 1);
}

async function extractBookingTurn(input: {
  tenantId: string;
  userMessage: string;
  timezone: string;
  bookingState: BookingConversationState;
  conversationHistory: Array<{ role: string; content: string }>;
}): Promise<BookingTurnExtraction> {
  const offeredSlotsSummary = input.bookingState.offeredSlots.length > 0
    ? input.bookingState.offeredSlots.map((slot, index) => `${index + 1}. ${slot.label} (${slot.startIso})`).join('\n')
    : 'None';
  const recentHistory = input.conversationHistory.slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join('\n');

  const prompt = [
    'You extract dental appointment booking details from a receptionist call.',
    `Clinic timezone: ${input.timezone}`,
    `Today in clinic timezone: ${formatTodayForPrompt(input.timezone)}`,
    'Resolve relative dates like "tomorrow" into YYYY-MM-DD in the clinic timezone.',
    'If no specific time is given but the caller says morning, afternoon, or evening, fill requestedPeriod.',
    'Use requestedTime in 24-hour HH:MM only when the caller gave a concrete time.',
    'If the caller selected one of the offered options, fill selectedSlotIndex (1-based) or selectedSlotStartIso.',
    'If a field is not clearly present, return null for it.',
    '',
    `Current booking state: ${JSON.stringify(input.bookingState)}`,
    `Currently offered slots:\n${offeredSlotsSummary}`,
    '',
    'Recent conversation:',
    recentHistory || 'None',
    '',
    `Latest caller message: ${input.userMessage}`,
    '',
    'Return JSON only with this exact shape:',
    JSON.stringify({
      bookingIntent: true,
      availabilityIntent: true,
      serviceName: null,
      requestedDate: null,
      requestedTime: null,
      requestedPeriod: null,
      selectedSlotIndex: null,
      selectedSlotStartIso: null,
      confirmed: false,
      declined: false,
      patient: {
        fullName: null,
        age: null,
        phoneNumber: null,
        reasonForVisit: null,
      },
    }, null, 2),
  ].join('\n');

  const result = await executeLlmWithFailover({
    workloadType: 'llm',
    tenantId: input.tenantId,
    maxLatencyMs: 7000,
    minReliability: 0.85,
    llmRequest: {
      model: 'gpt-4o-mini',
      tenantId: input.tenantId,
      temperature: 0.1,
      maxTokens: 400,
      messages: [
        { role: 'system', content: prompt },
      ],
    },
  });

  try {
    const parsed = JSON.parse(normalizeJsonBlock(result.content)) as {
      bookingIntent?: boolean;
      availabilityIntent?: boolean;
      serviceName?: string | null;
      requestedDate?: string | null;
      requestedTime?: string | null;
      requestedPeriod?: RequestedPeriod | null;
      selectedSlotIndex?: number | null;
      selectedSlotStartIso?: string | null;
      confirmed?: boolean;
      declined?: boolean;
      patient?: {
        fullName?: string | null;
        age?: number | null;
        phoneNumber?: string | null;
        reasonForVisit?: string | null;
      };
    };

    return {
      bookingIntent: Boolean(parsed.bookingIntent),
      availabilityIntent: Boolean(parsed.availabilityIntent),
      serviceName: parsed.serviceName ?? undefined,
      requestedDate: parsed.requestedDate ?? undefined,
      requestedTime: parsed.requestedTime ?? undefined,
      requestedPeriod: parsed.requestedPeriod ?? undefined,
      selectedSlotIndex: typeof parsed.selectedSlotIndex === 'number' ? parsed.selectedSlotIndex : undefined,
      selectedSlotStartIso: parsed.selectedSlotStartIso ?? undefined,
      confirmed: Boolean(parsed.confirmed),
      declined: Boolean(parsed.declined),
      patient: {
        fullName: parsed.patient?.fullName ?? undefined,
        age: typeof parsed.patient?.age === 'number' ? parsed.patient.age : undefined,
        phoneNumber: parsed.patient?.phoneNumber ?? undefined,
        reasonForVisit: parsed.patient?.reasonForVisit ?? undefined,
      },
    };
  } catch (error) {
    logger.warn({ err: error, tenantId: input.tenantId }, 'Failed to parse booking extraction JSON');
    return {
      bookingIntent: BOOKING_KEYWORDS.test(input.userMessage),
      availabilityIntent: /available|availability|opening|slot/i.test(input.userMessage),
      confirmed: /\b(yes|confirm|that works|book it|sounds good)\b/i.test(input.userMessage),
      declined: /\b(no|different time|another time|not that one)\b/i.test(input.userMessage),
      patient: {},
    };
  }
}

function getTimezone(context: TenantAIContext): string {
  const clinic = context.clinic as { timezone?: string };
  return clinic.timezone ?? 'America/New_York';
}

function getOperatingSchedule(context: TenantAIContext): Record<string, unknown> | null {
  const clinic = context.clinic as { businessHours?: Record<string, unknown> };
  const booking = context.bookingRules as { operatingSchedule?: Record<string, unknown> };
  return booking.operatingSchedule ?? clinic.businessHours ?? null;
}

function getClosedDates(context: TenantAIContext): string[] {
  const booking = context.bookingRules as { closedDates?: unknown };
  return Array.isArray(booking.closedDates)
    ? booking.closedDates.filter((value): value is string => typeof value === 'string')
    : [];
}

function getAppointmentDuration(context: TenantAIContext): number {
  const booking = context.bookingRules as { defaultAppointmentDurationMinutes?: number };
  return booking.defaultAppointmentDurationMinutes ?? 30;
}

function getBufferMinutes(context: TenantAIContext): number {
  const booking = context.bookingRules as { bufferBetweenAppointmentsMinutes?: number };
  return booking.bufferBetweenAppointmentsMinutes ?? 0;
}

function clinicName(context: TenantAIContext): string {
  return context.clinicName || 'the clinic';
}

function mergePatientDetails(
  current: PatientBookingDetails,
  incoming: PatientBookingDetails,
): PatientBookingDetails {
  return {
    fullName: incoming.fullName?.trim() || current.fullName,
    age: typeof incoming.age === 'number' ? incoming.age : current.age,
    phoneNumber: incoming.phoneNumber?.trim() || current.phoneNumber,
    reasonForVisit: incoming.reasonForVisit?.trim() || current.reasonForVisit,
  };
}

function getMissingPatientField(patient: PatientBookingDetails): keyof PatientBookingDetails | null {
  if (!patient.fullName) return 'fullName';
  if (typeof patient.age !== 'number') return 'age';
  if (!patient.phoneNumber) return 'phoneNumber';
  if (!patient.reasonForVisit) return 'reasonForVisit';
  return null;
}

function buildPatientQuestion(field: keyof PatientBookingDetails): string {
  if (field === 'fullName') {
    return 'Before I lock that in, may I have the patient’s full name?';
  }
  if (field === 'age') {
    return 'Thanks. What is the patient’s age?';
  }
  if (field === 'phoneNumber') {
    return 'What is the best phone number for the appointment?';
  }
  return 'What is the main reason for the visit today?';
}

function buildSlotOptionsText(slots: CalendarSlot[]): string {
  return slots
    .slice(0, 3)
    .map((slot, index) => `${index + 1}. ${slot.label}`)
    .join(' ');
}

function resolveSelectedSlot(
  bookingState: BookingConversationState,
  extraction: BookingTurnExtraction,
): CalendarSlot | undefined {
  if (extraction.selectedSlotStartIso) {
    return bookingState.offeredSlots.find((slot) => slot.startIso === extraction.selectedSlotStartIso);
  }

  if (typeof extraction.selectedSlotIndex === 'number' && extraction.selectedSlotIndex > 0) {
    return bookingState.offeredSlots[extraction.selectedSlotIndex - 1];
  }

  return undefined;
}

async function generateGeneralReceptionistResponse(input: {
  tenantId: string;
  sessionId: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userMessage: string;
}): Promise<string> {
  const result = await processConversationTurn({
    tenantId: input.tenantId,
    callSessionId: input.sessionId,
    systemPrompt: input.systemPrompt,
    conversationHistory: input.conversationHistory,
    userMessage: input.userMessage,
  });

  return result.response;
}

export async function processReceptionistTurnWithBooking(input: {
  tenantId: string;
  sessionId: string;
  aiContext: TenantAIContext;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userMessage: string;
  sessionState?: ReceptionistSessionState;
}): Promise<{
  response: string;
  sessionState: ReceptionistSessionState;
}> {
  const sessionState = ensureSessionState(input.sessionState);
  const bookingState = sessionState.booking;
  const timezone = getTimezone(input.aiContext);
  const extraction = await extractBookingTurn({
    tenantId: input.tenantId,
    userMessage: input.userMessage,
    timezone,
    bookingState,
    conversationHistory: input.conversationHistory,
  });

  bookingState.patient = mergePatientDetails(bookingState.patient, extraction.patient);
  if (extraction.serviceName) {
    bookingState.serviceName = extraction.serviceName.trim();
  }
  if (extraction.requestedDate) {
    bookingState.requestedDate = extraction.requestedDate;
  }
  if (extraction.requestedTime) {
    bookingState.requestedTime = extraction.requestedTime;
  }
  if (extraction.requestedPeriod) {
    bookingState.requestedPeriod = extraction.requestedPeriod;
  }

  const shouldHandleBooking = bookingState.active || extraction.bookingIntent || extraction.availabilityIntent;
  if (!shouldHandleBooking) {
    return {
      response: await generateGeneralReceptionistResponse({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        systemPrompt: input.systemPrompt,
        conversationHistory: input.conversationHistory,
        userMessage: input.userMessage,
      }),
      sessionState,
    };
  }

  bookingState.active = true;

  if (extraction.declined && bookingState.confirmationRequested) {
    bookingState.confirmationRequested = false;
    bookingState.selectedSlot = undefined;
    bookingState.status = 'offering_slots';
    return {
      response: 'No problem. I can offer another time. Would you prefer a morning, afternoon, or evening appointment?',
      sessionState,
    };
  }

  const selectedOfferedSlot = resolveSelectedSlot(bookingState, extraction);
  if (selectedOfferedSlot) {
    bookingState.selectedSlot = selectedOfferedSlot;
    bookingState.status = 'collecting_patient';
  }

  const calendarIntegration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!calendarIntegration) {
    bookingState.status = 'collecting_preference';
    return {
      response: `I can help gather the details, but ${clinicName(input.aiContext)} does not have a live calendar connected yet, so I cannot confirm an appointment in real time.`,
      sessionState,
    };
  }

  if (!bookingState.selectedSlot) {
    if (!bookingState.requestedDate) {
      bookingState.status = 'collecting_preference';
      return {
        response: 'I can help with that. What day would you like to come in, and do you prefer a specific time?',
        sessionState,
      };
    }

    const availability = await findAvailableCalendarSlots({
      tenantId: input.tenantId,
      timezone,
      requestedDate: bookingState.requestedDate,
      requestedTime: bookingState.requestedTime,
      requestedPeriod: bookingState.requestedPeriod,
      appointmentDurationMinutes: getAppointmentDuration(input.aiContext),
      bufferBetweenAppointmentsMinutes: getBufferMinutes(input.aiContext),
      operatingSchedule: getOperatingSchedule(input.aiContext),
      closedDates: getClosedDates(input.aiContext),
      maxSlots: 3,
      lookAheadDays: 7,
    });

    if (availability.exactMatch) {
      bookingState.selectedSlot = availability.exactMatch;
      bookingState.offeredSlots = [availability.exactMatch];
      bookingState.status = 'collecting_patient';
    } else if (availability.suggestedSlots.length > 0) {
      bookingState.offeredSlots = availability.suggestedSlots;
      bookingState.status = 'offering_slots';
      return {
        response: `I have a few openings. ${buildSlotOptionsText(availability.suggestedSlots)} Which option would you like?`,
        sessionState,
      };
    } else {
      bookingState.status = 'collecting_preference';
      return {
        response: 'I do not have an opening at that time. Would you like me to look at another day or a different part of the day?',
        sessionState,
      };
    }
  }

  const missingField = getMissingPatientField(bookingState.patient);
  if (missingField) {
    bookingState.status = 'collecting_patient';
    return {
      response: buildPatientQuestion(missingField),
      sessionState,
    };
  }

  if (!bookingState.confirmationRequested) {
    bookingState.confirmationRequested = true;
    bookingState.status = 'awaiting_confirmation';
    return {
      response: `Just to confirm, you’d like ${bookingState.selectedSlot?.label} for ${bookingState.patient.fullName}. The patient is ${bookingState.patient.age}, the best phone number is ${bookingState.patient.phoneNumber}, and the visit is for ${bookingState.patient.reasonForVisit}. Shall I book it?`,
      sessionState,
    };
  }

  if (!extraction.confirmed) {
    bookingState.status = 'awaiting_confirmation';
    return {
      response: 'Whenever you are ready, please say yes and I’ll confirm the appointment.',
      sessionState,
    };
  }

  const selectedSlot = bookingState.selectedSlot!;
  const finalAvailability = await findAvailableCalendarSlots({
    tenantId: input.tenantId,
    timezone,
    requestedDate: new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(selectedSlot.startIso)),
    requestedTime: new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(selectedSlot.startIso)),
    appointmentDurationMinutes: getAppointmentDuration(input.aiContext),
    bufferBetweenAppointmentsMinutes: getBufferMinutes(input.aiContext),
    operatingSchedule: getOperatingSchedule(input.aiContext),
    closedDates: getClosedDates(input.aiContext),
    maxSlots: 10,
    lookAheadDays: 1,
  });

  const slotStillAvailable = finalAvailability.suggestedSlots.some(
    (slot) => slot.startIso === selectedSlot.startIso && slot.endIso === selectedSlot.endIso,
  );

  if (!slotStillAvailable) {
    bookingState.confirmationRequested = false;
    bookingState.selectedSlot = undefined;
    bookingState.offeredSlots = finalAvailability.suggestedSlots;
    bookingState.status = 'offering_slots';
    return {
      response: finalAvailability.suggestedSlots.length > 0
        ? `That slot was just taken. I can offer ${buildSlotOptionsText(finalAvailability.suggestedSlots)}. Which one would you like instead?`
        : 'That slot was just taken, and I do not have another immediate opening. Would you like a different day?',
      sessionState,
    };
  }

  const appointment = await createGoogleCalendarAppointment({
    tenantId: input.tenantId,
    timezone,
    slot: selectedSlot,
    summary: bookingState.serviceName
      ? `${bookingState.serviceName} - ${bookingState.patient.fullName}`
      : `Dental appointment - ${bookingState.patient.fullName}`,
    patient: {
      fullName: bookingState.patient.fullName!,
      age: bookingState.patient.age!,
      phoneNumber: bookingState.patient.phoneNumber!,
      reasonForVisit: bookingState.patient.reasonForVisit!,
    },
  });

  bookingState.status = 'confirmed';
  bookingState.eventId = appointment.eventId;
  bookingState.offeredSlots = [];

  return {
    response: `You’re all set. I’ve booked ${appointment.slot.label} for ${bookingState.patient.fullName}. We’ll see you then, and if anything changes, please call the clinic.`,
    sessionState,
  };
}
