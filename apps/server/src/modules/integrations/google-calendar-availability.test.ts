import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { findAvailableCalendarSlots } from './google-calendar-availability.js';
import type { Integration } from './integration.types.js';

const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockResolveValidGoogleAccessToken = vi.hoisted(() => vi.fn());
const mockListLedgerAvailabilityBlockers = vi.hoisted(() => vi.fn());

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
  listLedgerAvailabilityBlockers: mockListLedgerAvailabilityBlockers,
}));

const integration = {
  id: 'integration-a',
  tenantId: 'tenant-a',
  config: { calendarId: 'primary' },
} as Integration;

const baseInput = {
  tenantId: 'tenant-a',
  timezone: 'UTC',
  requestedDate: '2026-06-01',
  requestedTime: '09:00',
  requestedPeriod: null,
  appointmentDurationMinutes: 30,
  bufferBetweenAppointmentsMinutes: 0,
  operatingSchedule: {
    monday: { start: '09:00', end: '10:00' },
  },
  closedDates: null,
  maxSlots: 1,
  lookAheadDays: 1,
};

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

function mockGoogleEvents(
  items: Array<{
    status?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ items }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockGetActiveGoogleCalendarIntegration.mockResolvedValue(integration);
  mockResolveValidGoogleAccessToken.mockResolvedValue({ accessToken: 'google-token', integration });
  mockListLedgerAvailabilityBlockers.mockResolvedValue([]);
  mockGoogleEvents([]);
});

describe('Google Calendar availability with local ledger blockers', () => {
  it('blocks slots with Google busy events', async () => {
    mockGoogleEvents([
      {
        status: 'confirmed',
        start: { dateTime: '2026-06-01T09:00:00.000Z' },
        end: { dateTime: '2026-06-01T09:30:00.000Z' },
      },
    ]);

    const result = await withTenant('tenant-a', () => findAvailableCalendarSlots(baseInput));

    expect(result.exactMatch).toBeNull();
    expect(result.suggestedSlots.map((slot) => slot.startIso)).not.toContain(
      '2026-06-01T09:00:00.000Z',
    );
  });

  it('blocks slots with local active holds', async () => {
    mockListLedgerAvailabilityBlockers.mockResolvedValueOnce([
      {
        startAt: new Date('2026-06-01T09:00:00.000Z'),
        endAt: new Date('2026-06-01T09:30:00.000Z'),
        source: 'hold',
      },
    ]);

    const result = await withTenant('tenant-a', () => findAvailableCalendarSlots(baseInput));

    expect(result.exactMatch).toBeNull();
    expect(result.suggestedSlots.map((slot) => slot.startIso)).not.toContain(
      '2026-06-01T09:00:00.000Z',
    );
  });

  it('blocks slots with local scheduled appointments', async () => {
    mockListLedgerAvailabilityBlockers.mockResolvedValueOnce([
      {
        startAt: new Date('2026-06-01T09:00:00.000Z'),
        endAt: new Date('2026-06-01T09:30:00.000Z'),
        source: 'appointment',
      },
    ]);

    const result = await withTenant('tenant-a', () => findAvailableCalendarSlots(baseInput));

    expect(result.exactMatch).toBeNull();
    expect(result.suggestedSlots.map((slot) => slot.startIso)).not.toContain(
      '2026-06-01T09:00:00.000Z',
    );
  });

  it('does not block slots when expired holds are omitted by the ledger query', async () => {
    mockListLedgerAvailabilityBlockers.mockResolvedValueOnce([]);

    const result = await withTenant('tenant-a', () => findAvailableCalendarSlots(baseInput));

    expect(result.exactMatch?.startIso).toBe('2026-06-01T09:00:00.000Z');
  });

  it('does not block slots when cancelled appointments are omitted by the ledger query', async () => {
    mockListLedgerAvailabilityBlockers.mockResolvedValueOnce([]);

    const result = await withTenant('tenant-a', () => findAvailableCalendarSlots(baseInput));

    expect(result.exactMatch?.startIso).toBe('2026-06-01T09:00:00.000Z');
  });

  it('queries ledger blockers only for the active tenant', async () => {
    await withTenant('tenant-b', () =>
      findAvailableCalendarSlots({
        ...baseInput,
        tenantId: 'tenant-b',
      }),
    );

    expect(mockListLedgerAvailabilityBlockers).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-b' }),
    );
  });
});
