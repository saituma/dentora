import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { getActiveTenantId } from '../../db/tenant-context.js';
import { logger } from '../../lib/logger.js';
import { createMediaStreamToken } from './stream-token.js';
import {
  getPendingMediaStreamCount,
  getPendingMediaStreamCountForIp,
  handleStreamStart,
  registerPendingMediaStreamConnection,
  resetPendingMediaStreamStateForTests,
  type TwilioStartMessage,
} from './media-stream.js';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockRecordMediaStreamHealthEvent = vi.hoisted(() => vi.fn());

vi.mock('../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
  getServices: vi.fn(),
  getPolicies: vi.fn(),
  getFaqs: vi.fn(),
  getBookingRules: vi.fn(),
  getVoiceProfile: vi.fn(),
}));

vi.mock('../operational-health/operational-health.service.js', () => ({
  recordMediaStreamHealthEvent: mockRecordMediaStreamHealthEvent,
}));

const nowMs = 1_800_000_000_000;
const streamInput = {
  tenantId: 'tenant-a',
  callSessionId: 'call-session-a',
  callSid: 'CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  configVersionId: 'config-version-a',
  nowMs,
};

function fakeSocket(): WebSocket {
  return {
    close: vi.fn(),
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;
}

function startMessage(streamToken?: string): TwilioStartMessage {
  return {
    event: 'start',
    streamSid: 'MZaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    start: {
      callSid: streamInput.callSid,
      customParameters: {
        tenantId: streamInput.tenantId,
        callSessionId: streamInput.callSessionId,
        configVersionId: streamInput.configVersionId,
        ...(streamToken ? { streamToken } : {}),
      },
    },
  };
}

function loggedPayload(): string {
  return JSON.stringify([
    vi.mocked(logger.info).mock.calls,
    vi.mocked(logger.warn).mock.calls,
    vi.mocked(logger.error).mock.calls,
  ]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nowMs));
  vi.clearAllMocks();
  mockRecordMediaStreamHealthEvent.mockResolvedValue(undefined);
  resetPendingMediaStreamStateForTests();
});

afterEach(() => {
  resetPendingMediaStreamStateForTests();
  vi.useRealTimers();
});

describe('media stream pending connection guard', () => {
  it('closes if no start message arrives before timeout and cleans up pending counts', () => {
    const close = vi.fn();

    const pending = registerPendingMediaStreamConnection({
      callSessionId: 'call-session-a',
      remoteAddress: '203.0.113.10',
      close,
      startTimeoutMs: 5_000,
    });

    expect(pending.accepted).toBe(true);
    expect(getPendingMediaStreamCount()).toBe(1);
    expect(getPendingMediaStreamCountForIp('203.0.113.10')).toBe(1);

    vi.advanceTimersByTime(5_000);

    expect(close).toHaveBeenCalledTimes(1);
    expect(getPendingMediaStreamCount()).toBe(0);
    expect(getPendingMediaStreamCountForIp('203.0.113.10')).toBe(0);
    expect(loggedPayload()).toContain('media_stream_start_timeout');
    expect(mockRecordMediaStreamHealthEvent).toHaveBeenCalledWith({
      tenantId: null,
      eventType: 'start_timeout',
      reasonCode: 'MEDIA_STREAM_START_TIMEOUT',
    });
  });

  it('clears timeout and pending counts when a valid start is accepted', () => {
    const close = vi.fn();

    const pending = registerPendingMediaStreamConnection({
      callSessionId: 'call-session-a',
      remoteAddress: '203.0.113.10',
      close,
      startTimeoutMs: 5_000,
    });

    pending.markStartValidated();
    vi.advanceTimersByTime(5_000);

    expect(close).not.toHaveBeenCalled();
    expect(getPendingMediaStreamCount()).toBe(0);
    expect(getPendingMediaStreamCountForIp('203.0.113.10')).toBe(0);
    expect(loggedPayload()).toContain('media_stream_start_validated');
  });

  it('decrements pending counts on explicit cleanup for close or error paths', () => {
    const pending = registerPendingMediaStreamConnection({
      callSessionId: 'call-session-a',
      remoteAddress: '203.0.113.10',
      close: vi.fn(),
    });

    expect(getPendingMediaStreamCount()).toBe(1);
    pending.cleanup();
    pending.cleanup();

    expect(getPendingMediaStreamCount()).toBe(0);
    expect(getPendingMediaStreamCountForIp('203.0.113.10')).toBe(0);
  });

  it('rejects excess global pending connections', () => {
    const first = registerPendingMediaStreamConnection({
      callSessionId: 'call-session-a',
      remoteAddress: '203.0.113.10',
      close: vi.fn(),
      maxGlobalPending: 1,
      maxPendingPerIp: 10,
    });
    const secondClose = vi.fn();

    const second = registerPendingMediaStreamConnection({
      callSessionId: 'call-session-b',
      remoteAddress: '203.0.113.11',
      close: secondClose,
      maxGlobalPending: 1,
      maxPendingPerIp: 10,
    });

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(getPendingMediaStreamCount()).toBe(1);
    expect(loggedPayload()).toContain('media_stream_pending_limit_exceeded');
    expect(mockRecordMediaStreamHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        eventType: 'pending_limit_exceeded',
        reasonCode: 'MEDIA_STREAM_PENDING_LIMIT_EXCEEDED',
      }),
    );
  });

  it('rejects excess per-IP pending connections', () => {
    registerPendingMediaStreamConnection({
      callSessionId: 'call-session-a',
      remoteAddress: '203.0.113.10',
      close: vi.fn(),
      maxGlobalPending: 10,
      maxPendingPerIp: 1,
    });
    const secondClose = vi.fn();

    const second = registerPendingMediaStreamConnection({
      callSessionId: 'call-session-b',
      remoteAddress: '203.0.113.10',
      close: secondClose,
      maxGlobalPending: 10,
      maxPendingPerIp: 1,
    });

    expect(second.accepted).toBe(false);
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(getPendingMediaStreamCountForIp('203.0.113.10')).toBe(1);
  });
});

describe('media stream start validation failure', () => {
  it('closes missing-token start messages before tenant context or config loading', async () => {
    const ws = fakeSocket();

    const accepted = await handleStreamStart(ws, streamInput.callSessionId, startMessage());

    expect(accepted).toBe(false);
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(getActiveTenantId()).toBeUndefined();
    expect(mockGetClinicProfile).not.toHaveBeenCalled();
    expect(loggedPayload()).toContain('media_stream_invalid_start');
    expect(mockRecordMediaStreamHealthEvent).toHaveBeenCalledWith({
      tenantId: null,
      eventType: 'invalid_start',
      reasonCode: 'MEDIA_STREAM_INVALID_START',
    });
  });

  it('closes invalid-token start messages without logging raw token or PHI', async () => {
    const ws = fakeSocket();
    const rawToken = 'invalid.token.value';

    const accepted = await handleStreamStart(ws, streamInput.callSessionId, startMessage(rawToken));

    expect(accepted).toBe(false);
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(mockGetClinicProfile).not.toHaveBeenCalled();
    const logs = loggedPayload();
    expect(logs).toContain('media_stream_invalid_start');
    expect(logs).not.toContain(rawToken);
    expect(logs).not.toContain('Jane Secret');
    expect(logs).not.toContain('+15551234567');
  });

  it('closes expired-token start messages before config loading', async () => {
    const ws = fakeSocket();
    const expiredToken = createMediaStreamToken({
      ...streamInput,
      ttlSeconds: 1,
      nowMs: nowMs - 2_000,
    });

    const accepted = await handleStreamStart(
      ws,
      streamInput.callSessionId,
      startMessage(expiredToken),
    );

    expect(accepted).toBe(false);
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(getActiveTenantId()).toBeUndefined();
    expect(mockGetClinicProfile).not.toHaveBeenCalled();
  });
});
