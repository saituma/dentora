import 'dotenv/config';
import twilio from 'twilio';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

type TwilioIncomingNumber = {
  sid: string;
  phone_number: string;
};

type TwilioIncomingNumberPage = {
  incoming_phone_numbers?: TwilioIncomingNumber[];
  next_page_uri?: string | null;
};

function getWebhookConfig() {
  const baseUrl = requireEnv('TWILIO_WEBHOOK_BASE_URL').replace(/\/$/, '');
  const twimlAppSid = (process.env.TWILIO_TWIML_APP_SID || '').trim();

  return {
    baseUrl,
    twimlAppSid,
    voiceUrl: `${baseUrl}/api/telephony/webhook/voice`,
    statusCallback: `${baseUrl}/api/telephony/webhook/status`,
  };
}

function toAbsoluteTwilioUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `https://api.twilio.com${pathOrUrl}`;
}

async function fetchIncomingNumberPage(
  url: string,
  accountSid: string,
  authToken: string,
): Promise<TwilioIncomingNumberPage> {
  const auth = Buffer.from(`${accountSid}:${authToken}`, 'utf8').toString('base64');
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      // ignore parse failures
    }
    throw new Error(`Failed to fetch Twilio numbers: ${detail}`);
  }

  return await response.json() as TwilioIncomingNumberPage;
}

async function listAllIncomingNumbers(accountSid: string, authToken: string): Promise<TwilioIncomingNumber[]> {
  const all: TwilioIncomingNumber[] = [];
  let url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1000`;

  while (url) {
    const page = await fetchIncomingNumberPage(url, accountSid, authToken);
    const pageNumbers = Array.isArray(page.incoming_phone_numbers) ? page.incoming_phone_numbers : [];
    all.push(...pageNumbers);

    if (!page.next_page_uri) break;
    url = toAbsoluteTwilioUrl(page.next_page_uri);
  }

  return all;
}

async function main(): Promise<void> {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const config = getWebhookConfig();

  const client = twilio(accountSid, authToken);
  const numbers = await listAllIncomingNumbers(accountSid, authToken);

  if (numbers.length === 0) {
    console.log('No incoming Twilio numbers found. Nothing to sync.');
    return;
  }

  console.log(`Syncing webhook config to ${numbers.length} Twilio number(s)...`);
  console.log(
    config.twimlAppSid
      ? `Routing mode: TwiML App (${config.twimlAppSid}); status callback: ${config.statusCallback}`
      : `Routing mode: Voice URL (${config.voiceUrl}); status callback: ${config.statusCallback}`,
  );

  let success = 0;
  let failed = 0;

  for (const number of numbers) {
    try {
      if (config.twimlAppSid) {
        await client.incomingPhoneNumbers(number.sid).update({
          voiceApplicationSid: config.twimlAppSid,
          statusCallback: config.statusCallback,
          statusCallbackMethod: 'POST',
        });
      } else {
        await client.incomingPhoneNumbers(number.sid).update({
          voiceUrl: config.voiceUrl,
          voiceMethod: 'POST',
          statusCallback: config.statusCallback,
          statusCallbackMethod: 'POST',
        });
      }

      success += 1;
      console.log(`OK  ${number.phone_number} (${number.sid})`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERR ${number.phone_number} (${number.sid}) -> ${message}`);
    }
  }

  console.log(`Done. success=${success}, failed=${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
