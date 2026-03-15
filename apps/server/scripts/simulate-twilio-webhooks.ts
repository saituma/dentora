import crypto from 'node:crypto';

function buildTwilioSignature(url: string, params: Record<string, unknown>, authToken: string): string {
  const pairs = Object.entries(params)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((item) => [key, item]);
      }
      return [[key, value]];
    })
    .map(([key, value]) => [key, value == null ? '' : String(value)] as const);

  pairs.sort(([a], [b]) => a.localeCompare(b));

  const data = pairs.reduce((acc, [key, value]) => `${acc}${key}${value}`, url);

  return crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');
}

async function postForm(url: string, params: Record<string, string>, authToken: string): Promise<void> {
  const signature = buildTwilioSignature(url, params, authToken);
  const body = new URLSearchParams(params);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body,
  });

  const text = await res.text();
  const statusLine = `${res.status} ${res.statusText}`.trim();
  // Keep output concise but useful.
  console.log(`POST ${url} -> ${statusLine}`);
  if (text) {
    console.log(text);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const baseUrl = (process.env.TWILIO_SIMULATOR_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const toNumber = process.env.TWILIO_TO_NUMBER || '+15558675310';
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+15551234567';
  const callSid = process.env.TWILIO_CALL_SID || `CA${crypto.randomBytes(16).toString('hex')}`;
  const apiVersion = '2010-04-01';

  const voiceUrl = `${baseUrl}/api/telephony/webhook/voice`;
  const statusUrl = `${baseUrl}/api/telephony/webhook/status`;

  const common = {
    CallSid: callSid,
    AccountSid: accountSid,
    From: fromNumber,
    To: toNumber,
    Direction: 'inbound',
    ApiVersion: apiVersion,
  };

  await postForm(
    voiceUrl,
    {
      ...common,
      CallStatus: 'ringing',
    },
    authToken,
  );

  await postForm(
    statusUrl,
    {
      ...common,
      CallStatus: 'completed',
      CallDuration: '10',
    },
    authToken,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
