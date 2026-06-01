import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getClinicProfile } = vi.hoisted(() => ({ getClinicProfile: vi.fn() }));
vi.mock('../config/config.service.js', () => ({ getClinicProfile }));

import { buildAiUnavailableTwiml } from './telephony.routes.js';

const TENANT = 'tenant-1';
const SESSION = 'session-1';
const CALLED = '+441234567890'; // the clinic's Twilio line that was dialled

describe('buildAiUnavailableTwiml (ElevenLabs-down graceful fallback)', () => {
  beforeEach(() => getClinicProfile.mockReset());

  it('forwards to the practice number, then forward-status handles no-answer→voicemail', async () => {
    getClinicProfile.mockResolvedValue({ primaryPhone: '+447700900123' });
    const twiml = await buildAiUnavailableTwiml(TENANT, SESSION, CALLED);

    expect(twiml).toContain('<Dial');
    expect(twiml).toContain('<Number>+447700900123</Number>');
    expect(twiml).toContain('/api/telephony/webhook/forward-status');
    // Never commits the caller to dead-air dependent <Connect><Stream>.
    expect(twiml).not.toContain('<Connect>');
  });

  it('falls back to voicemail when no practice number is configured', async () => {
    getClinicProfile.mockResolvedValue({ primaryPhone: null });
    const twiml = await buildAiUnavailableTwiml(TENANT, SESSION, CALLED);

    expect(twiml).not.toContain('<Dial');
    expect(twiml).toContain('<Record');
    expect(twiml).toContain('/api/telephony/webhook/voicemail');
  });

  it('takes a voicemail (no dial) when the only number equals the called line — avoids a loop', async () => {
    getClinicProfile.mockResolvedValue({ primaryPhone: CALLED });
    const twiml = await buildAiUnavailableTwiml(TENANT, SESSION, CALLED);

    expect(twiml).not.toContain('<Dial');
    expect(twiml).toContain('<Record');
  });
});
