import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../lib/errors.js';

const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockResolveValidGoogleAccessToken = vi.hoisted(() => vi.fn());
const mockGetAppointmentByExternalCalendarEventId = vi.hoisted(() => vi.fn());
const mockCreateStaffReviewItemSafely = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./integration-registry.js', () => ({
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
}));

vi.mock('./google-calendar.shared.js', async () => {
  const actual = await vi.importActual<typeof import('./google-calendar.shared.js')>(
    './google-calendar.shared.js',
  );
  return {
    ...actual,
    resolveValidGoogleAccessToken: mockResolveValidGoogleAccessToken,
  };
});

vi.mock('../appointments/appointment-ledger.service.js', () => ({
  getAppointmentByExternalCalendarEventId: mockGetAppointmentByExternalCalendarEventId,
}));

vi.mock('../staff-review/staff-review.service.js', () => ({
  createStaffReviewItemSafely: mockCreateStaffReviewItemSafely,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import { runWithTenantContext } from '../../db/tenant-context.js';
import {
  buildLegacyGoogleCalendarScrubPayload,
  scanLegacyGoogleCalendarPhi,
  scrubLegacyGoogleCalendarPhi,
} from './google-calendar-phi-scanner.js';
import type { Integration } from './integration.types.js';

interface FetchResponse {
  ok: boolean;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}

const integration = {
  id: 'integration-a',
  tenantId: 'tenant-a',
  config: { calendarId: 'primary' },
} as Integration;

const safeEvent = {
  id: 'safe-event',
  summary: 'Dental Appointment',
  description:
    'Appointment managed by DentalFlow. View patient details inside the DentalFlow dashboard.',
  start: { dateTime: '2026-06-01T14:00:00.000Z', timeZone: 'UTC' },
  end: { dateTime: '2026-06-01T14:30:00.000Z', timeZone: 'UTC' },
  extendedProperties: {
    private: {
      tenantId: 'tenant-a',
      appAppointmentId: 'appointment-a',
      source: 'dentalflow',
    },
  },
};

function withTenant<T>(callback: () => T): T {
  return runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, callback);
}

function stubFetchResponses(responses: FetchResponse[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected fetch call');
      return Promise.resolve(next);
    }),
  );
}

function listResponse(events: unknown[]): FetchResponse {
  return {
    ok: true,
    json: () => Promise.resolve({ items: events }),
  };
}

function patchResponse(): FetchResponse {
  return {
    ok: true,
    json: () => Promise.resolve({}),
  };
}

function expectNoRawPhi(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('Jane Secret');
  expect(serialized).not.toContain('+15551234567');
  expect(serialized).not.toContain('1990-01-01');
  expect(serialized).not.toContain('needs sedation');
  expect(serialized).not.toContain('Severe tooth pain');
  expect(serialized).not.toContain('patientName');
  expect(serialized).not.toContain('phoneNumber');
  expect(serialized).not.toContain('dateOfBirth');
  expect(serialized).not.toContain('reasonForVisit');
  expect(serialized).not.toContain('notes');
}

function patchBodyAt(index: number): Record<string, unknown> {
  const fetchMock = vi.mocked(fetch);
  const init = fetchMock.mock.calls[index]?.[1];
  expect(init).toBeDefined();
  expect(typeof init?.body).toBe('string');
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockGetActiveGoogleCalendarIntegration.mockResolvedValue(integration);
  mockResolveValidGoogleAccessToken.mockResolvedValue({ accessToken: 'google-token', integration });
  mockGetAppointmentByExternalCalendarEventId.mockResolvedValue({ id: 'appointment-from-ledger' });
});

describe('legacy Google Calendar PHI scanner', () => {
  it('detects PHI in event summary without returning raw PHI', async () => {
    stubFetchResponses([
      listResponse([
        {
          ...safeEvent,
          id: 'legacy-summary',
          summary: 'Dental appointment - Jane Secret',
        },
      ]),
    ]);

    const report = await withTenant(() =>
      scanLegacyGoogleCalendarPhi({
        tenantId: 'tenant-a',
        now: new Date('2026-05-13T12:00:00.000Z'),
      }),
    );

    expect(report).toMatchObject({ totalEventsScanned: 1, riskyEventsCount: 1 });
    expect(report.riskyEvents[0]?.riskCodes).toContain('SUMMARY_LEGACY_DETAIL');
    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        type: 'legacy_calendar_phi_detected',
        source: 'calendar_phi_scanner',
        reasonCode: 'LEGACY_GOOGLE_CALENDAR_PHI_DETECTED',
      }),
    );
    expectNoRawPhi(report);
    expectNoRawPhi(mockLogger.info.mock.calls);
  });

  it('detects PHI in description, private properties, and shared properties', async () => {
    stubFetchResponses([
      listResponse([
        {
          ...safeEvent,
          id: 'legacy-rich',
          description: 'Patient Jane Secret DOB 1990-01-01 phone +15551234567 notes needs sedation',
          extendedProperties: {
            private: {
              patientName: 'Jane Secret',
              phoneNumber: '+15551234567',
              dateOfBirth: '1990-01-01',
            },
            shared: {
              reasonForVisit: 'Severe tooth pain',
              notes: 'needs sedation',
            },
          },
        },
      ]),
    ]);

    const report = await withTenant(() => scanLegacyGoogleCalendarPhi({ tenantId: 'tenant-a' }));

    expect(report.riskyEvents[0]?.riskCodes).toEqual(
      expect.arrayContaining([
        'DESCRIPTION_PHI_KEYWORD',
        'DESCRIPTION_PHONE_PATTERN',
        'DESCRIPTION_DOB_PATTERN',
        'PRIVATE_PHI_FIELD',
        'PRIVATE_PHONE_PATTERN',
        'PRIVATE_DOB_PATTERN',
        'SHARED_PHI_FIELD',
      ]),
    );
    expectNoRawPhi(report);
  });

  it('builds a safe replacement payload and preserves safe appAppointmentId', () => {
    const payload = buildLegacyGoogleCalendarScrubPayload({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      appAppointmentId: 'appointment-a',
      event: {
        ...safeEvent,
        summary: 'Dental appointment - Jane Secret',
        description: 'DOB 1990-01-01 phone +15551234567',
      },
    });

    expect(payload).toMatchObject({
      summary: 'Dental Appointment',
      description:
        'Appointment managed by DentalFlow. View patient details inside the DentalFlow dashboard.',
      start: { dateTime: '2026-06-01T14:00:00.000Z', timeZone: 'UTC' },
      end: { dateTime: '2026-06-01T14:30:00.000Z', timeZone: 'UTC' },
      extendedProperties: {
        private: {
          tenantId: 'tenant-a',
          appAppointmentId: 'appointment-a',
          source: 'dentalflow',
        },
      },
    });
    expectNoRawPhi(payload);
  });

  it('dry-run scrub does not call Google update', async () => {
    stubFetchResponses([
      listResponse([
        {
          ...safeEvent,
          id: 'legacy-summary',
          summary: 'Dental appointment - Jane Secret',
        },
      ]),
    ]);

    const result = await withTenant(() =>
      scrubLegacyGoogleCalendarPhi({
        tenantId: 'tenant-a',
        timezone: 'UTC',
        dryRun: true,
      }),
    );

    expect(result).toMatchObject({
      dryRun: true,
      totalEventsScanned: 1,
      riskyEventsCount: 1,
      eventsScrubbed: 0,
      eventsSkipped: 1,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expectNoRawPhi(result);
  });

  it('dry-run false without confirm fails safely before scanning', async () => {
    await expect(
      withTenant(() =>
        scrubLegacyGoogleCalendarPhi({
          tenantId: 'tenant-a',
          timezone: 'UTC',
          dryRun: false,
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockGetActiveGoogleCalendarIntegration).not.toHaveBeenCalled();
  });

  it('confirmed scrub calls Google update with sanitized payload only', async () => {
    stubFetchResponses([
      listResponse([
        {
          ...safeEvent,
          id: 'legacy-summary',
          summary: 'Dental appointment - Jane Secret',
          extendedProperties: {
            private: { appAppointmentId: 'appointment-a', patientName: 'Jane Secret' },
          },
        },
      ]),
      patchResponse(),
    ]);

    const result = await withTenant(() =>
      scrubLegacyGoogleCalendarPhi({
        tenantId: 'tenant-a',
        timezone: 'UTC',
        dryRun: false,
        confirm: true,
      }),
    );

    expect(result).toMatchObject({
      dryRun: false,
      totalEventsScanned: 1,
      riskyEventsCount: 1,
      eventsScrubbed: 1,
      eventsSkipped: 0,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const body = patchBodyAt(1);
    expect(body).toMatchObject({
      summary: 'Dental Appointment',
      extendedProperties: {
        private: {
          tenantId: 'tenant-a',
          appAppointmentId: 'appointment-a',
          source: 'dentalflow',
        },
      },
    });
    expectNoRawPhi(body);
    expectNoRawPhi(result);
  });

  it('uses local ledger mapping when legacy event has no safe appAppointmentId', async () => {
    stubFetchResponses([
      listResponse([
        {
          ...safeEvent,
          id: 'legacy-summary',
          summary: 'Dental appointment - Jane Secret',
          extendedProperties: { private: { patientName: 'Jane Secret' } },
        },
      ]),
      patchResponse(),
    ]);

    await withTenant(() =>
      scrubLegacyGoogleCalendarPhi({
        tenantId: 'tenant-a',
        timezone: 'UTC',
        dryRun: false,
        confirm: true,
      }),
    );

    expect(mockGetAppointmentByExternalCalendarEventId).toHaveBeenCalledWith(
      'tenant-a',
      'legacy-summary',
    );
    expect(patchBodyAt(1)).toMatchObject({
      extendedProperties: {
        private: {
          appAppointmentId: 'appointment-from-ledger',
        },
      },
    });
  });
});
