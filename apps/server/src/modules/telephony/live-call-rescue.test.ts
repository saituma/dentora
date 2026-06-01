import { describe, it, expect, vi, beforeEach } from 'vitest';

// Twilio creds must exist before config/env.js loads, else createTwilioRestClient throws.
vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'authtest';
  process.env.TWILIO_WEBHOOK_BASE_URL = 'http://localhost:4000';
});

const { getClinicProfile } = vi.hoisted(() => ({ getClinicProfile: vi.fn() }));
const { update } = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('../config/config.service.js', () => ({ getClinicProfile }));
vi.mock('twilio', () => ({
  default: vi.fn(() => ({ calls: vi.fn(() => ({ update })) })),
}));

import { redirectLiveCallToFallback } from './telephony.service.js';

const ARGS = { tenantId: 't1', callSid: 'CA123', callSessionId: 's1' };
const twimlOf = () => (update.mock.calls.at(-1)?.[0] as { twiml: string }).twiml;

describe('redirectLiveCallToFallback (rescue after mid-call AI drop)', () => {
  beforeEach(() => {
    getClinicProfile.mockReset();
    update.mockReset();
    update.mockResolvedValue({});
  });

  it('redirects the live call to the practice number when one is configured', async () => {
    getClinicProfile.mockResolvedValue({ primaryPhone: '+447700900123' });
    const res = await redirectLiveCallToFallback(ARGS);

    expect(res.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const twiml = twimlOf();
    expect(twiml).toContain('<Dial');
    expect(twiml).toContain('<Number>+447700900123</Number>');
    expect(twiml).toContain('/api/telephony/webhook/forward-status');
  });

  it('redirects to voicemail when no practice number is configured', async () => {
    getClinicProfile.mockResolvedValue({ primaryPhone: null });
    const res = await redirectLiveCallToFallback(ARGS);

    expect(res.success).toBe(true);
    const twiml = twimlOf();
    expect(twiml).not.toContain('<Dial');
    expect(twiml).toContain('<Record');
    expect(twiml).toContain('/api/telephony/webhook/voicemail');
  });

  it('reports failure (so the caller is hung up cleanly) if the Twilio redirect throws', async () => {
    getClinicProfile.mockResolvedValue({ primaryPhone: '+447700900123' });
    update.mockImplementation(async () => {
      throw new Error('twilio down');
    });
    const res = await redirectLiveCallToFallback(ARGS);
    expect(res.success).toBe(false);
  });
});
