import {
  createGoogleCalendarAppointment,
  findAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration,
  type CalendarSlot,
} from '../integrations/integration.service.js';
import { upsertPatientProfile } from '../patients/patients.service.js';
import { processConversationTurn, type TenantAIContext } from './ai.service.js';
import {
  buildPatientQuestion,
  buildSlotOptionsText,
  clinicName,
  formatDateInTimezone,
  getAppointmentDuration,
  getBufferMinutes,
  getClosedDates,
  getMissingPatientField,
  getOperatingSchedule,
  getTimezone,
  isClinicOpenOnDate,
  mergePatientDetails,
} from './receptionist-booking.context.js';
import { resetBookingState } from './receptionist-booking.state.js';
import type {
  BookingConversationState,
  BookingTurnExtraction,
  ReceptionistSessionState,
  RequestedPeriod,
} from './receptionist-booking.types.js';
import {
  buildDirectResponseTokens,
  formatTodayForPrompt,
  isBookingConfirmationMessage,
  isRawBookingIntent,
  messageLooksBookingRelated,
  normalizeImplicitYearDate,
  normalizeJsonBlock,
  normalizeMessage,
  resolveRequestedDateFromMessage,
} from './receptionist-booking.utils.js';
import { executeLlmWithFailover } from './engine/index.js';
import { logger } from '../../lib/logger.js';
import { buildDirectReceptionistResponse } from './receptionist-booking.direct-response.js';

function resolveSelectedSlot(bookingState: BookingConversationState, extraction: BookingTurnExtraction): CalendarSlot | undefined {
  if (extraction.selectedSlotStartIso) {
    return bookingState.offeredSlots.find((slot) => slot.startIso === extraction.selectedSlotStartIso);
  }
  if (typeof extraction.selectedSlotIndex === 'number' && extraction.selectedSlotIndex > 0) {
    return bookingState.offeredSlots[extraction.selectedSlotIndex - 1];
  }
  return undefined;
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
  const recentHistory = input.conversationHistory.slice(-6).map((turn) => `${turn.role}: ${turn.content}`).join('\n');

  const prompt = [
    'You extract dental appointment booking details from a receptionist call.',
    `Clinic timezone: ${input.timezone}`,
    `Today in clinic timezone: ${formatTodayForPrompt(input.timezone)}`,
    'Resolve relative dates like "tomorrow" into YYYY-MM-DD in the clinic timezone.',
    'If the caller gives a date without a year (e.g., "April 2nd"), assume the current year in the clinic timezone.',
    'If that date already passed this year and no year was stated, assume the next upcoming year.',
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
      messages: [{ role: 'system', content: prompt }],
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
      patient?: { fullName?: string | null; age?: number | null; phoneNumber?: string | null; reasonForVisit?: string | null };
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
      bookingIntent: isRawBookingIntent(input.userMessage),
      availabilityIntent: /available|availability|opening|slot/i.test(input.userMessage),
      confirmed: /\b(yes|confirm|that works|book it|sounds good)\b/i.test(input.userMessage),
      declined: /\b(no|different time|another time|not that one)\b/i.test(input.userMessage),
      patient: {},
    };
  }
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

export async function processBookingTurn(input: {
  tenantId: string;
  sessionId: string;
  aiContext: TenantAIContext;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userMessage: string;
  sessionState: ReceptionistSessionState;
}): Promise<{ response: string; sessionState: ReceptionistSessionState }> {
  const bookingState = input.sessionState.booking;
  const timezone = getTimezone(input.aiContext);

  const directResponse = buildDirectReceptionistResponse(input.aiContext, input.userMessage);
  if (!bookingState.active && directResponse) {
    return { response: directResponse, sessionState: input.sessionState };
  }

  const shouldAttemptBooking = bookingState.active || messageLooksBookingRelated(input.userMessage);
  if (!shouldAttemptBooking) {
    return {
      response: await generateGeneralReceptionistResponse(input),
      sessionState: input.sessionState,
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
  if (extraction.serviceName) bookingState.serviceName = extraction.serviceName.trim();

  const userIsChoosingTime = extraction.availabilityIntent || extraction.bookingIntent;
  if ((requestedDateFromMessage || extraction.requestedDate) && userIsChoosingTime) {
    const rawDate = requestedDateFromMessage ?? extraction.requestedDate;
    bookingState.requestedDate = rawDate
      ? normalizeImplicitYearDate(rawDate, input.userMessage, timezone)
      : rawDate;
    bookingState.selectedSlot = undefined;
    bookingState.offeredSlots = [];
    bookingState.confirmationRequested = false;
  }
  if (extraction.requestedTime && userIsChoosingTime) {
    bookingState.requestedTime = extraction.requestedTime;
    bookingState.selectedSlot = undefined;
    bookingState.offeredSlots = [];
    bookingState.confirmationRequested = false;
  }
  if (extraction.requestedPeriod && userIsChoosingTime) {
    bookingState.requestedPeriod = extraction.requestedPeriod;
    bookingState.selectedSlot = undefined;
    bookingState.offeredSlots = [];
    bookingState.confirmationRequested = false;
  }

  const shouldHandleBooking = bookingState.active || extraction.bookingIntent || extraction.availabilityIntent;
  if (!shouldHandleBooking) {
    return {
      response: await generateGeneralReceptionistResponse(input),
      sessionState: input.sessionState,
    };
  }

  bookingState.active = true;

  if (extraction.declined && bookingState.confirmationRequested) {
    bookingState.confirmationRequested = false;
    bookingState.selectedSlot = undefined;
    bookingState.status = 'offering_slots';
    return {
      response: 'No problem. I can offer another time. Would you prefer a morning, afternoon, or evening appointment?',
      sessionState: input.sessionState,
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
      sessionState: input.sessionState,
    };
  }

  if (!bookingState.selectedSlot) {
    if (!bookingState.requestedDate) {
      bookingState.status = 'collecting_preference';
      return {
        response: 'I can help with that. What day would you like to come in, and do you prefer a specific time?',
        sessionState: input.sessionState,
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
      const hasSameDaySuggestion = requestedDate
        ? availability.suggestedSlots.some((slot) => formatDateInTimezone(new Date(slot.startIso), timezone) === requestedDate)
        : false;
      const clinicOpenThatDay = requestedDate
        ? isClinicOpenOnDate(getOperatingSchedule(input.aiContext), getClosedDates(input.aiContext), requestedDate, timezone)
        : true;
      const intro = requestedDate && !hasSameDaySuggestion
        ? clinicOpenThatDay
          ? 'I do not have any more openings today.'
          : 'Sorry, we are closed today, but I can book you for another day.'
        : 'I have a few openings.';
      return {
        response: `${intro} ${buildSlotOptionsText(availability.suggestedSlots, timezone)} Which time would you like?`,
        sessionState: input.sessionState,
      };
    } else {
      bookingState.status = 'collecting_preference';
      return {
        response: 'I do not have an opening at that time. Would you like me to look at another day or a different part of the day?',
        sessionState: input.sessionState,
      };
    }
  }

  const missingField = getMissingPatientField(bookingState.patient);
  if (missingField) {
    bookingState.status = 'collecting_patient';
    return { response: buildPatientQuestion(missingField), sessionState: input.sessionState };
  }

  if (!bookingState.confirmationRequested) {
    bookingState.confirmationRequested = true;
    bookingState.status = 'awaiting_confirmation';
    return {
      response: `Just to confirm, you’d like ${bookingState.selectedSlot?.label} for ${bookingState.patient.fullName}. The patient is ${bookingState.patient.age}, the best phone number is ${bookingState.patient.phoneNumber}, and the visit is for ${bookingState.patient.reasonForVisit}. Shall I book it?`,
      sessionState: input.sessionState,
    };
  }

  if (!(extraction.confirmed || isBookingConfirmationMessage(input.userMessage))) {
    bookingState.status = 'awaiting_confirmation';
    return {
      response: 'Whenever you are ready, please say yes and I’ll confirm the appointment.',
      sessionState: input.sessionState,
    };
  }

  const selectedSlot = bookingState.selectedSlot!;
  const finalAvailability = await findAvailableCalendarSlots({
    tenantId: input.tenantId,
    timezone,
    requestedDate: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(selectedSlot.startIso)),
    requestedTime: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(selectedSlot.startIso)),
    appointmentDurationMinutes: getAppointmentDuration(input.aiContext),
    bufferBetweenAppointmentsMinutes: getBufferMinutes(input.aiContext),
    operatingSchedule: getOperatingSchedule(input.aiContext),
    closedDates: getClosedDates(input.aiContext),
    maxSlots: 10,
    lookAheadDays: 1,
  });

  const slotStillAvailable = finalAvailability.suggestedSlots.some((slot) => slot.startIso === selectedSlot.startIso && slot.endIso === selectedSlot.endIso);
  if (!slotStillAvailable) {
    bookingState.confirmationRequested = false;
    bookingState.selectedSlot = undefined;
    bookingState.offeredSlots = finalAvailability.suggestedSlots;
    bookingState.status = 'offering_slots';
    return {
      response: finalAvailability.suggestedSlots.length > 0
        ? `That slot was just taken. ${buildSlotOptionsText(finalAvailability.suggestedSlots, timezone)} Which time would you like instead?`
        : 'That slot was just taken, and I do not have another immediate opening. Would you like a different day?',
      sessionState: input.sessionState,
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

  await upsertPatientProfile({
    tenantId: input.tenantId,
    fullName: bookingState.patient.fullName!,
    phoneNumber: bookingState.patient.phoneNumber!,
    dateOfBirth: null,
    lastVisitAt: new Date(selectedSlot.startIso),
    notes: bookingState.patient.reasonForVisit!,
  });

  input.sessionState.booking = { ...resetBookingState(), status: 'confirmed', eventId: appointment.eventId };
  return {
    response: `You’re all set. I’ve booked ${appointment.slot.label} for ${bookingState.patient.fullName}. We’ll see you then, and if anything changes, please call the clinic.`,
    sessionState: input.sessionState,
  };
}
