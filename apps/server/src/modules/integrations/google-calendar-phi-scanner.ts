import { createHash } from 'node:crypto';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { getAppointmentByExternalCalendarEventId } from '../appointments/appointment-ledger.service.js';
import { createStaffReviewItemSafely } from '../staff-review/staff-review.service.js';
import { buildSafeGoogleCalendarAppointmentEvent } from './google-calendar-appointments.js';
import { resolveValidGoogleAccessToken } from './google-calendar.shared.js';
import { getActiveGoogleCalendarIntegration } from './integration-registry.js';

export type GoogleCalendarPhiRiskCode =
  | 'SUMMARY_LEGACY_DETAIL'
  | 'SUMMARY_PHI_KEYWORD'
  | 'SUMMARY_PHONE_PATTERN'
  | 'SUMMARY_DOB_PATTERN'
  | 'DESCRIPTION_PHI_KEYWORD'
  | 'DESCRIPTION_PHONE_PATTERN'
  | 'DESCRIPTION_DOB_PATTERN'
  | 'PRIVATE_PHI_FIELD'
  | 'PRIVATE_PHONE_PATTERN'
  | 'PRIVATE_DOB_PATTERN'
  | 'SHARED_PHI_FIELD'
  | 'SHARED_PHONE_PATTERN'
  | 'SHARED_DOB_PATTERN';

export interface GoogleCalendarPhiRiskyEvent {
  eventRef: string;
  riskCodes: GoogleCalendarPhiRiskCode[];
  recommendedAction: 'scrub_google_event';
}

export interface GoogleCalendarPhiScanReport {
  totalEventsScanned: number;
  riskyEventsCount: number;
  riskyEvents: GoogleCalendarPhiRiskyEvent[];
  checkedAt: string;
}

export interface GoogleCalendarPhiScrubResult extends GoogleCalendarPhiScanReport {
  dryRun: boolean;
  eventsScrubbed: number;
  eventsSkipped: number;
}

interface GoogleCalendarEventProperties {
  private?: Record<string, unknown>;
  shared?: Record<string, unknown>;
}

interface GoogleCalendarEventLike {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  extendedProperties?: GoogleCalendarEventProperties;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}

interface SanitizedScrubCandidate {
  event: GoogleCalendarEventLike;
  riskCodes: GoogleCalendarPhiRiskCode[];
  appAppointmentId?: string;
  payload?: Record<string, unknown>;
}

const SAFE_SUMMARY = 'Dental Appointment';
const PHI_FIELD_KEYS = new Set([
  'patientname',
  'dateofbirth',
  'dob',
  'phonenumber',
  'phone',
  'age',
  'reasonforvisit',
  'reason',
  'notes',
  'transcript',
  'symptom',
]);
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const DOB_PATTERN =
  /\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/;
const PHI_KEYWORD_PATTERN =
  /\b(patient|dob|date of birth|phone|reason|notes?|symptoms?|transcript|age)\b/i;

function getCalendarId(config: Record<string, unknown>): string {
  return typeof config.calendarId === 'string' && config.calendarId.trim()
    ? config.calendarId
    : 'primary';
}

function safeEventRef(eventId: string | undefined): string {
  const digest = createHash('sha256')
    .update(eventId ?? 'missing-event-id')
    .digest('hex');
  return `gcal_${digest.slice(0, 16)}`;
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function addRisk(risks: Set<GoogleCalendarPhiRiskCode>, code: GoogleCalendarPhiRiskCode): void {
  risks.add(code);
}

function scanString(
  value: string | undefined,
  risks: Set<GoogleCalendarPhiRiskCode>,
  codes: {
    keyword: GoogleCalendarPhiRiskCode;
    phone: GoogleCalendarPhiRiskCode;
    dob: GoogleCalendarPhiRiskCode;
  },
): void {
  if (!value) return;
  if (PHI_KEYWORD_PATTERN.test(value)) addRisk(risks, codes.keyword);
  if (PHONE_PATTERN.test(value)) addRisk(risks, codes.phone);
  if (DOB_PATTERN.test(value)) addRisk(risks, codes.dob);
}

function scanProperties(
  value: Record<string, unknown> | undefined,
  risks: Set<GoogleCalendarPhiRiskCode>,
  codes: {
    field: GoogleCalendarPhiRiskCode;
    phone: GoogleCalendarPhiRiskCode;
    dob: GoogleCalendarPhiRiskCode;
  },
): void {
  if (!value) return;
  for (const [key, entry] of Object.entries(value)) {
    if (PHI_FIELD_KEYS.has(normalizeFieldKey(key))) {
      addRisk(risks, codes.field);
    }
    if (typeof entry === 'string') {
      if (PHONE_PATTERN.test(entry)) addRisk(risks, codes.phone);
      if (DOB_PATTERN.test(entry)) addRisk(risks, codes.dob);
      if (PHI_KEYWORD_PATTERN.test(entry)) addRisk(risks, codes.field);
    }
  }
}

export function detectGoogleCalendarPhiRiskCodes(
  event: GoogleCalendarEventLike,
): GoogleCalendarPhiRiskCode[] {
  const risks = new Set<GoogleCalendarPhiRiskCode>();
  const summary = event.summary?.trim();
  if (summary && summary !== SAFE_SUMMARY) addRisk(risks, 'SUMMARY_LEGACY_DETAIL');
  scanString(summary, risks, {
    keyword: 'SUMMARY_PHI_KEYWORD',
    phone: 'SUMMARY_PHONE_PATTERN',
    dob: 'SUMMARY_DOB_PATTERN',
  });
  scanString(event.description, risks, {
    keyword: 'DESCRIPTION_PHI_KEYWORD',
    phone: 'DESCRIPTION_PHONE_PATTERN',
    dob: 'DESCRIPTION_DOB_PATTERN',
  });
  scanProperties(event.extendedProperties?.private, risks, {
    field: 'PRIVATE_PHI_FIELD',
    phone: 'PRIVATE_PHONE_PATTERN',
    dob: 'PRIVATE_DOB_PATTERN',
  });
  scanProperties(event.extendedProperties?.shared, risks, {
    field: 'SHARED_PHI_FIELD',
    phone: 'SHARED_PHONE_PATTERN',
    dob: 'SHARED_DOB_PATTERN',
  });
  return Array.from(risks).sort();
}

function safePrivateProperties(event: GoogleCalendarEventLike): Record<string, unknown> {
  return event.extendedProperties?.private ?? {};
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function resolveSafeAppAppointmentId(input: {
  tenantId: string;
  event: GoogleCalendarEventLike;
}): Promise<string | undefined> {
  const privateProperties = safePrivateProperties(input.event);
  const existing = safeString(privateProperties.appAppointmentId);
  if (existing) return existing;
  const eventId = safeString(input.event.id);
  if (!eventId) return undefined;
  try {
    const appointment = await getAppointmentByExternalCalendarEventId(input.tenantId, eventId);
    return appointment.id;
  } catch {
    return undefined;
  }
}

export function buildLegacyGoogleCalendarScrubPayload(input: {
  tenantId: string;
  timezone: string;
  appAppointmentId?: string;
  event: GoogleCalendarEventLike;
}): Record<string, unknown> | null {
  const startIso = input.event.start?.dateTime ?? input.event.start?.date;
  const endIso = input.event.end?.dateTime ?? input.event.end?.date;
  if (!startIso || !endIso) return null;
  return buildSafeGoogleCalendarAppointmentEvent({
    tenantId: input.tenantId,
    timezone: input.event.start?.timeZone ?? input.timezone,
    appAppointmentId: input.appAppointmentId,
    slot: {
      startIso,
      endIso,
    },
  });
}

async function fetchCalendarEvents(input: {
  tenantId: string;
  timeMin?: string;
  timeMax?: string;
}): Promise<{ calendarId: string; accessToken: string; events: GoogleCalendarEventLike[] }> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }
  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const calendarId = getCalendarId((integration.config ?? {}) as Record<string, unknown>);
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  if (input.timeMin) url.searchParams.set('timeMin', input.timeMin);
  if (input.timeMax) url.searchParams.set('timeMax', input.timeMax);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new ValidationError('Failed to scan Google Calendar events');
  }
  const payload = (await response.json()) as { items?: GoogleCalendarEventLike[] };
  return {
    calendarId,
    accessToken,
    events: (payload.items ?? []).filter((event) => event.status !== 'cancelled'),
  };
}

export async function scanLegacyGoogleCalendarPhi(input: {
  tenantId: string;
  timeMin?: string;
  timeMax?: string;
  now?: Date;
}): Promise<GoogleCalendarPhiScanReport> {
  assertTenantAccess(input.tenantId);
  const { events } = await fetchCalendarEvents(input);
  const riskyEvents = events
    .map((event) => ({
      eventRef: safeEventRef(event.id),
      riskCodes: detectGoogleCalendarPhiRiskCodes(event),
      recommendedAction: 'scrub_google_event' as const,
    }))
    .filter((event) => event.riskCodes.length > 0);

  logger.info(
    {
      tenantId: input.tenantId,
      totalEventsScanned: events.length,
      riskyEventsCount: riskyEvents.length,
      riskCodes: Array.from(new Set(riskyEvents.flatMap((event) => event.riskCodes))).sort(),
    },
    'Legacy Google Calendar PHI scan completed',
  );
  if (riskyEvents.length > 0) {
    await createStaffReviewItemSafely({
      tenantId: input.tenantId,
      type: 'legacy_calendar_phi_detected',
      severity: 'high',
      source: 'calendar_phi_scanner',
      reasonCode: 'LEGACY_GOOGLE_CALENDAR_PHI_DETECTED',
      message: 'Legacy Google Calendar events may contain PHI and need review.',
      metadata: {
        totalEventsScanned: events.length,
        riskyEventsCount: riskyEvents.length,
        riskCodes: Array.from(new Set(riskyEvents.flatMap((event) => event.riskCodes))).sort(),
        eventRefs: riskyEvents.map((event) => event.eventRef).slice(0, 25),
      },
      dedupeKey: 'calendar_phi:legacy_detected',
    });
  }

  return {
    totalEventsScanned: events.length,
    riskyEventsCount: riskyEvents.length,
    riskyEvents,
    checkedAt: (input.now ?? new Date()).toISOString(),
  };
}

async function buildScrubCandidates(input: {
  tenantId: string;
  timezone: string;
  events: GoogleCalendarEventLike[];
}): Promise<SanitizedScrubCandidate[]> {
  const candidates: SanitizedScrubCandidate[] = [];
  for (const event of input.events) {
    const riskCodes = detectGoogleCalendarPhiRiskCodes(event);
    if (riskCodes.length === 0) continue;
    const appAppointmentId = await resolveSafeAppAppointmentId({ tenantId: input.tenantId, event });
    candidates.push({
      event,
      riskCodes,
      appAppointmentId,
      payload:
        buildLegacyGoogleCalendarScrubPayload({
          tenantId: input.tenantId,
          timezone: input.timezone,
          appAppointmentId,
          event,
        }) ?? undefined,
    });
  }
  return candidates;
}

export async function scrubLegacyGoogleCalendarPhi(input: {
  tenantId: string;
  timezone: string;
  timeMin?: string;
  timeMax?: string;
  dryRun?: boolean;
  confirm?: boolean;
  now?: Date;
}): Promise<GoogleCalendarPhiScrubResult> {
  assertTenantAccess(input.tenantId);
  const dryRun = input.dryRun ?? true;
  if (!dryRun && input.confirm !== true) {
    throw new ValidationError('Confirmed Google Calendar PHI scrub requires confirm=true');
  }

  const { calendarId, accessToken, events } = await fetchCalendarEvents(input);
  const candidates = await buildScrubCandidates({
    tenantId: input.tenantId,
    timezone: input.timezone,
    events,
  });
  const riskyEvents = candidates.map((candidate) => ({
    eventRef: safeEventRef(candidate.event.id),
    riskCodes: candidate.riskCodes,
    recommendedAction: 'scrub_google_event' as const,
  }));

  let eventsScrubbed = 0;
  let eventsSkipped = 0;
  if (!dryRun) {
    for (const candidate of candidates) {
      const eventId = safeString(candidate.event.id);
      if (!eventId || !candidate.payload) {
        eventsSkipped += 1;
        continue;
      }
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(candidate.payload),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok) {
        eventsScrubbed += 1;
      } else {
        eventsSkipped += 1;
      }
    }
  }

  logger.info(
    {
      tenantId: input.tenantId,
      dryRun,
      totalEventsScanned: events.length,
      riskyEventsCount: riskyEvents.length,
      eventsScrubbed,
      eventsSkipped,
      riskCodes: Array.from(new Set(riskyEvents.flatMap((event) => event.riskCodes))).sort(),
    },
    'Legacy Google Calendar PHI scrub evaluated',
  );

  return {
    dryRun,
    totalEventsScanned: events.length,
    riskyEventsCount: riskyEvents.length,
    riskyEvents,
    eventsScrubbed,
    eventsSkipped: dryRun ? candidates.length : eventsSkipped,
    checkedAt: (input.now ?? new Date()).toISOString(),
  };
}
