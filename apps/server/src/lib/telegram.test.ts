import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  env: {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_ALERT_CHAT_ID: '-100123',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    TWILIO_WEBHOOK_BASE_URL: 'https://example.com',
  },
}));

vi.mock('../config/env.js', () => mockEnv);
vi.mock('./logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { sendTelegramMessage, registerTelegramWebhook } from './telegram.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendTelegramMessage', () => {
  it('retries as plain text when the HTML send returns 400', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad entity' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    await sendTelegramMessage('<b>Tom &amp; Jerry</b>');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.parse_mode).toBeUndefined();
    expect(secondBody.text).toBe('Tom & Jerry');
  });

  it('does not retry when the first send succeeds', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });
    await sendTelegramMessage('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('truncates messages over the Telegram limit', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });
    await sendTelegramMessage('x'.repeat(5000));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text.length).toBeLessThanOrEqual(4020);
    expect(body.text.endsWith('…(truncated)')).toBe(true);
  });
});

describe('registerTelegramWebhook', () => {
  it('registers against a public HTTPS base URL', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await registerTelegramWebhook();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/setWebhook');
    expect(JSON.parse(opts.body).url).toBe('https://example.com/api/telegram/webhook/secret');
  });

  it('skips registration for a localhost base URL', async () => {
    mockEnv.env.TWILIO_WEBHOOK_BASE_URL = 'http://localhost:4000';
    await registerTelegramWebhook();
    expect(fetchMock).not.toHaveBeenCalled();
    mockEnv.env.TWILIO_WEBHOOK_BASE_URL = 'https://example.com';
  });
});
