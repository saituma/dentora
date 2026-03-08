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
const GREETING_PATTERNS = [
  /\bhi\b/i,
  /\bhello\b/i,
  /\bhey\b/i,
  /\bgood morning\b/i,
  /\bgood afternoon\b/i,
  /\bgood evening\b/i,
];
const SMALL_TALK_PATTERNS = [
  /\bhow are you\b/i,
  /\bhow are you doing\b/i,
  /\bhow s it going\b/i,
  /\bthanks\b/i,
  /\bthank you\b/i,
];
const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function normalizeMessage(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getTodayDateString(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysToDateString(date: string, daysToAdd: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function resolveRequestedDateFromMessage(message: string, timezone: string): string | undefined {
  const normalized = normalizeMessage(message);
  if (!normalized) return undefined;

  const today = getTodayDateString(timezone);
  if (/\btoday\b/.test(normalized)) {
    return today;
  }
  if (/\btomorrow\b/.test(normalized)) {
    return addDaysToDateString(today, 1);
  }

  const todayDayKey = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(new Date()).toLowerCase() as typeof WEEKDAY_KEYS[number];
  const todayIndex = WEEKDAY_KEYS.indexOf(todayDayKey);
  if (todayIndex === -1) return undefined;

  for (const dayKey of WEEKDAY_KEYS) {
    if (!new RegExp(`\\b${dayKey}\\b`, 'i').test(normalized)) continue;

    const requestedIndex = WEEKDAY_KEYS.indexOf(dayKey);
    let daysAhead = (requestedIndex - todayIndex + 7) % 7;
    if (daysAhead === 0 && new RegExp(`\\bnext\\s+${dayKey}\\b`, 'i').test(normalized)) {
      daysAhead = 7;
    }
    return addDaysToDateString(today, daysAhead);
  }

  return undefined;
}

function messageLooksBookingRelated(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;

  return (
    BOOKING_KEYWORDS.test(normalized)
    || /\bdoctor\b/.test(normalized)
    || /\bdentist\b/.test(normalized)
    || /\bcheckup\b/.test(normalized)
    || /\bcleaning\b/.test(normalized)
    || /\btoothache\b/.test(normalized)
    || /\bpain\b/.test(normalized)
    || /\bemergency\b/.test(normalized)
  );
}

function buildDirectReceptionistResponse(
  context: TenantAIContext,
  message: string,
): string | null {
  const normalized = normalizeMessage(message);
  const clinic = context.clinic as {
    phone?: string;
    primaryPhone?: string;
    email?: string;
    supportEmail?: string;
    address?: string;
  };
  const phone = clinic.phone ?? clinic.primaryPhone;
  const email = clinic.email ?? clinic.supportEmail;
  const address = clinic.address;

  if (SMALL_TALK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    if (/\bthanks\b/i.test(normalized) || /\bthank you\b/i.test(normalized)) {
      return 'You’re welcome. Is there anything else I can help you with today?';
    }
    return 'I’m doing well, thank you for asking. How can I help you today?';
  }

  if (GREETING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return `Hello, thank you for calling ${clinicName(context)}. How can I help you today?`;
  }

  if ((/\bclinic phone\b/i.test(normalized) || /\bphone number\b/i.test(normalized) || /\bcall the clinic\b/i.test(normalized)) && phone) {
    return `The clinic phone number is ${phone}. Is there anything else I can help you with?`;
  }

  if ((/\bemail\b/i.test(normalized) || /\bmail\b/i.test(normalized)) && email) {
    return `The clinic email is ${email}. Is there anything else I can help you with?`;
  }

  if ((/\baddress\b/i.test(normalized) || /\blocated\b/i.test(normalized) || /\blocation\b/i.test(normalized)) && address) {
    return `The clinic is located at ${address}. Is there anything else I can help you with?`;
  }

  return null;
}

function createEmptyBookingState(): BookingConversationState {
  return {
    active: false,
    status: 'idle',
    offeredSlots: [],
    patient: {},
    confirmationRequested: false,
  };
}

function resetBookingState(): BookingConversationState {
  return createEmptyBookingState();
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

function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getDayKeyForDate(date: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const localDate = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(localDate).toLowerCase();
}

function isClinicOpenOnDate(
  schedule: Record<string, unknown> | null,
  closedDates: string[],
  requestedDate: string,
  timezone: string,
): boolean {
  if (closedDates.includes(requestedDate)) return false;
  if (!schedule || typeof schedule !== 'object') return false;

  const dayKey = getDayKeyForDate(requestedDate, timezone);
  if (!dayKey) return false;
  const rawEntry = schedule[dayKey];
  if (!rawEntry || typeof rawEntry !== 'object') return false;
  const entry = rawEntry as { start?: unknown; end?: unknown };
  return typeof entry.start === 'string' && !!entry.start.trim() && typeof entry.end === 'string' && !!entry.end.trim();
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

function formatFullSlotDate(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(startIso));
}

function formatSlotTime(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));
}

function joinWithOr(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function buildSlotOptionsText(slots: CalendarSlot[], timezone: string): string {
  const topSlots = slots.slice(0, 3);
  if (topSlots.length === 0) return '';

  const sameDate = topSlots.every(
    (slot) => formatDateInTimezone(new Date(slot.startIso), timezone) === formatDateInTimezone(new Date(topSlots[0].startIso), timezone),
  );

  if (sameDate) {
    const dateLabel = formatFullSlotDate(topSlots[0].startIso, timezone);
    const timeLabels = topSlots.map((slot) => formatSlotTime(slot.startIso, timezone));
    return `I have openings on ${dateLabel} at ${joinWithOr(timeLabels)}.`;
  }

  const optionLabels = topSlots.map(
    (slot) => `${formatFullSlotDate(slot.startIso, timezone)} at ${formatSlotTime(slot.startIso, timezone)}`,
  );
  return `I have openings on ${joinWithOr(optionLabels)}.`;
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
  const directResponse = buildDirectReceptionistResponse(input.aiContext, input.userMessage);
  if (!bookingState.active && directResponse) {
    return {
      response: directResponse,
      sessionState,
    };
  }

  const shouldAttemptBooking = bookingState.active || messageLooksBookingRelated(input.userMessage);
  if (!shouldAttemptBooking) {
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

  const extraction = await extractBookingTurn({
    tenantId: input.tenantId,
    userMessage: input.userMessage,
    timezone,
    bookingState,
    conversationHistory: input.conversationHistory,
  });
  const requestedDateFromMessage = resolveRequestedDateFromMessage(input.userMessage, timezone);

  bookingState.patient = mergePatientDetails(bookingState.patient, extraction.patient);
  if (extraction.serviceName) {
    bookingState.serviceName = extraction.serviceName.trim();
  }
  if (requestedDateFromMessage || extraction.requestedDate) {
    bookingState.requestedDate = requestedDateFromMessage ?? extraction.requestedDate;
    bookingState.selectedSlot = undefined;
    bookingState.offeredSlots = [];
    bookingState.confirmationRequested = false;
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
      const requestedDate = bookingState.requestedDate;
      const schedule = getOperatingSchedule(input.aiContext);
      const closedDates = getClosedDates(input.aiContext);
      const hasSameDaySuggestion = requestedDate
        ? availability.suggestedSlots.some((slot) => formatDateInTimezone(new Date(slot.startIso), timezone) === requestedDate)
        : false;
      const clinicOpenThatDay = requestedDate
        ? isClinicOpenOnDate(schedule, closedDates, requestedDate, timezone)
        : true;

      const intro = requestedDate && !hasSameDaySuggestion
        ? clinicOpenThatDay
          ? 'I do not have any more openings today.'
          : 'Sorry, we are closed today, but I can book you for another day.'
        : 'I have a few openings.';
      return {
        response: `${intro} ${buildSlotOptionsText(availability.suggestedSlots, timezone)} Which time would you like?`,
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
        ? `That slot was just taken. ${buildSlotOptionsText(finalAvailability.suggestedSlots, timezone)} Which time would you like instead?`
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

  sessionState.booking = {
    ...resetBookingState(),
    status: 'confirmed',
    eventId: appointment.eventId,
  };

  return {
    response: `You’re all set. I’ve booked ${appointment.slot.label} for ${bookingState.patient.fullName}. We’ll see you then, and if anything changes, please call the clinic.`,
    sessionState,
  };
}
