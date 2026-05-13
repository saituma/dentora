import { describe, expect, it } from 'vitest';
import { redactLogValue, redactPhoneNumbers } from './log-redaction.js';

describe('log redaction helpers', () => {
  it('redacts E.164 phone numbers from log strings', () => {
    expect(redactPhoneNumbers('Caller +15555550123 asked for an appointment')).toBe(
      'Caller [REDACTED] asked for an appointment',
    );
  });

  it('redacts phone numbers and transcript text from nested log objects', () => {
    const redacted = redactLogValue({
      tenantId: 'tenant-a',
      payload: {
        phoneNumber: '+15555550123',
        text: 'My name is Jane Doe and I need a crown.',
      },
      message: 'Forward to +15555550124',
    });

    expect(redacted).toEqual({
      tenantId: 'tenant-a',
      payload: {
        phoneNumber: '[REDACTED]',
        text: '[REDACTED]',
      },
      message: 'Forward to [REDACTED]',
    });
  });
});
