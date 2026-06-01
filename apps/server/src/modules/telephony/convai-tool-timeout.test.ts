import { describe, it, expect } from 'vitest';
import { withToolTimeout } from './convai-tools.js';

describe('withToolTimeout (ConvAI tool-call hang protection)', () => {
  it('returns the real tool result when it completes within the timeout', async () => {
    const result = await withToolTimeout(
      'check_availability',
      't1',
      async () => ({ success: true, slots: 3 }),
      1000,
    );
    expect(result).toEqual({ success: true, slots: 3 });
  });

  it('returns a graceful fallback (not a freeze) when the tool hangs', async () => {
    const result = (await withToolTimeout(
      'create_appointment',
      't1',
      () => new Promise<never>(() => {}), // never resolves
      20,
    )) as { success: boolean; message: string };
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/trouble|follow up/i);
  });

  it('propagates a thrown tool error so it surfaces as is_error upstream', async () => {
    await expect(
      withToolTimeout(
        'lookup_patient',
        't1',
        async () => {
          throw new Error('db exploded');
        },
        1000,
      ),
    ).rejects.toThrow('db exploded');
  });
});
