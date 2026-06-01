import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: mockDb,
}));

import {
  countRecentMediaStreamHealthEvents,
  countRecentMediaStreamEventsByType,
  getOperationalHealthSnapshot,
  recordMediaStreamHealthEvent,
  recordOperationalHealthFailure,
  recordOperationalHealthStarted,
  recordOperationalHealthSuccess,
} from './operational-health.service.js';

function insertChain() {
  const chain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function selectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function latestInsertedValue(): Record<string, unknown> {
  const chain = mockDb.insert.mock.results.at(-1)?.value as ReturnType<typeof insertChain>;
  return chain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(insertChain());
  mockDb.select.mockReturnValue(selectChain([]));
});

describe('operational health service', () => {
  it('writes maintenance started state', async () => {
    const now = new Date('2026-05-14T12:00:00.000Z');

    await recordOperationalHealthStarted({ component: 'appointment_maintenance', now });

    const chain = mockDb.insert.mock.results[0].value as ReturnType<typeof insertChain>;
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'appointment_maintenance',
        status: 'degraded',
        lastStartedAt: now,
        metadata: { state: 'started' },
      }),
    );
  });

  it('writes maintenance success with safe count metadata', async () => {
    const now = new Date('2026-05-14T12:05:00.000Z');

    await recordOperationalHealthSuccess({
      component: 'appointment_maintenance',
      now,
      metadata: {
        tenantsProcessed: 2,
        tenantsFailed: 0,
        holdsExpired: 3,
        reconciliationCandidatesFound: 4,
        reconciliationCandidatesProcessed: 1,
        durationMs: 250,
      },
    });

    const serialized = JSON.stringify(latestInsertedValue());
    expect(serialized).toContain('tenantsProcessed');
    expect(serialized).toContain('reconciliationCandidatesProcessed');
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
  });

  it('writes failure using safe error name and code only', async () => {
    const error = Object.assign(new Error('Jane Secret +15551234567 raw stack'), {
      code: 'ECONNRESET',
    });

    await recordOperationalHealthFailure({
      component: 'appointment_maintenance',
      error,
      metadata: { phase: 'maintenance_run' },
      now: new Date('2026-05-14T12:05:00.000Z'),
    });

    const serialized = JSON.stringify(latestInsertedValue());
    expect(serialized).toContain('ECONNRESET');
    expect(serialized).toContain('Error');
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('raw stack');
  });

  it('returns stale measured health when heartbeat is too old', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          component: 'appointment_maintenance',
          status: 'healthy',
          lastStartedAt: new Date('2026-05-14T11:00:00.000Z'),
          lastCompletedAt: new Date('2026-05-14T11:01:00.000Z'),
          lastSuccessAt: new Date('2026-05-14T11:01:00.000Z'),
          lastFailureAt: null,
          lastErrorCode: null,
          lastErrorName: null,
          metadata: { tenantsProcessed: 2 },
          updatedAt: new Date('2026-05-14T11:01:00.000Z'),
        },
      ]),
    );

    const snapshot = await getOperationalHealthSnapshot({
      component: 'appointment_maintenance',
      now: new Date('2026-05-14T12:00:00.000Z'),
      maxAgeMs: 30 * 60 * 1000,
    });

    expect(snapshot).toMatchObject({
      component: 'appointment_maintenance',
      status: 'healthy',
      fresh: false,
      metadata: { tenantsProcessed: 2 },
    });
  });

  it('records media-stream health events without raw token or caller data', async () => {
    await recordMediaStreamHealthEvent({
      tenantId: null,
      eventType: 'invalid_start',
      reasonCode: 'MEDIA_STREAM_INVALID_START',
      metadata: {
        token: 'raw.jwt.token',
        callerText: 'Jane Secret',
        pendingCount: 3,
      },
      occurredAt: new Date('2026-05-14T12:00:00.000Z'),
    });

    const serialized = JSON.stringify(latestInsertedValue());
    expect(serialized).toContain('MEDIA_STREAM_INVALID_START');
    expect(serialized).toContain('pendingCount');
    expect(serialized).not.toContain('raw.jwt.token');
    expect(serialized).not.toContain('Jane Secret');
  });

  it('counts recent tenant and unknown-tenant media-stream events', async () => {
    const chain = {
      from: vi.fn(),
      where: vi.fn().mockResolvedValue([{ value: 3 }]),
    };
    chain.from.mockReturnValue(chain);
    mockDb.select.mockReturnValueOnce(chain);

    await expect(
      countRecentMediaStreamHealthEvents({
        tenantId: 'tenant-a',
        since: new Date('2026-05-14T00:00:00.000Z'),
      }),
    ).resolves.toBe(3);
  });

  it('counts recent events globally by type (for the call-drop spike watch)', async () => {
    const chain = {
      from: vi.fn(),
      where: vi.fn().mockResolvedValue([{ value: 5 }]),
    };
    chain.from.mockReturnValue(chain);
    mockDb.select.mockReturnValueOnce(chain);

    await expect(
      countRecentMediaStreamEventsByType({
        eventType: 'abnormal_disconnect',
        since: new Date('2026-05-14T00:00:00.000Z'),
      }),
    ).resolves.toBe(5);
  });
});
