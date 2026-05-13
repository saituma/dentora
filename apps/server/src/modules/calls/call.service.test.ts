import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from '../../db/index.js';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { decrypt } from '../../lib/encryption.js';

const mockExecuteLlmWithFailover = vi.hoisted(() => vi.fn());

vi.mock('../ai/engine/index.js', () => ({
  executeLlmWithFailover: mockExecuteLlmWithFailover,
}));

import {
  generateCallSummary,
  getCallTranscript,
  logCallEvent,
  saveTranscript,
} from './call.service.js';

interface InsertChain {
  values: Mock;
}

interface SelectChain {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
}

interface UpdateChain {
  set: Mock;
  where: Mock;
}

interface MockDb {
  insert: Mock;
  select: Mock;
  update: Mock;
}

const mockDb = db as unknown as MockDb;

function insertChain(): InsertChain {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function selectChain(result: unknown[]): SelectChain {
  const chain: SelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  return chain;
}

function updateChain(): UpdateChain {
  const chain: UpdateChain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  chain.set.mockReturnValue(chain);
  return chain;
}

function withTenant<T>(callback: () => T): T {
  return runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, callback);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('call PHI storage protections', () => {
  it('sanitizes raw caller content before persisting call events', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValueOnce(chain);

    await withTenant(() =>
      logCallEvent({
        tenantId: 'tenant-a',
        callSessionId: 'call-a',
        eventType: 'conversation.message',
        actor: 'user',
        payload: {
          text: 'My name is Jane Doe and my phone is +15555550123',
          phoneNumber: '+15555550123',
          safeMetadata: 'turn-1',
        },
      }),
    );

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          text: '[REDACTED]',
          phoneNumber: '[REDACTED]',
          safeMetadata: 'turn-1',
        },
      }),
    );
  });

  it('encrypts fullTranscript before persistence', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValueOnce(chain);
    const rawContent = 'Jane Doe needs a root canal on Friday';

    await withTenant(() =>
      saveTranscript({
        tenantId: 'tenant-a',
        callSessionId: 'call-a',
        fullTranscript: [{ role: 'user', content: rawContent }],
        summary: 'Caller requested treatment.',
      }),
    );

    const persisted = chain.values.mock.calls[0]?.[0] as {
      fullTranscript: { encrypted: true; ciphertext: string };
    };
    const serialized = JSON.stringify(persisted.fullTranscript);

    expect(persisted.fullTranscript.encrypted).toBe(true);
    expect(serialized).not.toContain(rawContent);
    expect(decrypt(persisted.fullTranscript.ciphertext)).toContain(rawContent);
  });

  it('decrypts encrypted fullTranscript when reading transcripts', async () => {
    const insert = insertChain();
    mockDb.insert.mockReturnValueOnce(insert);
    const rawContent = 'Jane Doe asked for emergency care';

    await withTenant(() =>
      saveTranscript({
        tenantId: 'tenant-a',
        callSessionId: 'call-a',
        fullTranscript: [{ role: 'user', content: rawContent }],
        summary: 'Emergency care request.',
      }),
    );

    const persisted = insert.values.mock.calls[0]?.[0] as {
      fullTranscript: { encrypted: true; ciphertext: string };
      summary: string;
    };
    mockDb.select.mockReturnValueOnce(selectChain([persisted]));

    const transcript = await withTenant(() => getCallTranscript('tenant-a', 'call-a'));

    expect(transcript?.fullTranscript).toEqual([{ role: 'user', content: rawContent }]);
    expect(JSON.stringify(persisted.fullTranscript)).not.toContain(rawContent);
  });

  it('keeps call summary generation behavior working', async () => {
    const update = updateChain();
    mockDb.update.mockReturnValueOnce(update);
    mockExecuteLlmWithFailover.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: 'Caller asked about whitening options.',
        sentiment: 'neutral',
        intent: 'inquiry',
      }),
    });

    const summary = await withTenant(() =>
      generateCallSummary({
        tenantId: 'tenant-a',
        callSessionId: 'call-a',
        transcriptTurns: [{ role: 'user', content: 'Do you offer whitening?' }],
      }),
    );

    expect(summary).toBe('Caller asked about whitening options.');
    expect(update.set).toHaveBeenCalledWith({
      sentiment: 'neutral',
      intentDetected: 'inquiry',
    });
  });
});
