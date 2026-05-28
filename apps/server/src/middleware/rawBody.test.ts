import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { captureRawBodyForPmsWebhooks } from './rawBody.js';

interface TestRequest extends IncomingMessage {
  originalUrl?: string;
  rawBody?: string;
}

describe('raw body capture middleware', () => {
  it('preserves the exact PMS webhook payload bytes for signature verification', () => {
    const req = {
      originalUrl: '/api/pms/webhooks/dentally/tenant-a/integration-a',
    } as TestRequest;
    const rawBody = '{ "event_type" : "appointment.created", "data" : { "id" : 1 } }';

    captureRawBodyForPmsWebhooks(req, {} as ServerResponse, Buffer.from(rawBody, 'utf8'), 'utf8');

    expect(req.rawBody).toBe(rawBody);
  });

  it('does not retain raw bodies for non-webhook API routes', () => {
    const req = { originalUrl: '/api/auth/login' } as TestRequest;

    captureRawBodyForPmsWebhooks(
      req,
      {} as ServerResponse,
      Buffer.from('{"email":"test@example.com"}', 'utf8'),
      'utf8',
    );

    expect(req.rawBody).toBeUndefined();
  });
});
