import 'dotenv/config';

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
  friendly_name?: string | null;
  capabilities?: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
    fax?: boolean;
  } | null;
};

type TwilioIncomingNumberPage = {
  incoming_phone_numbers?: TwilioIncomingNumber[];
  next_page_uri?: string | null;
};

function toAbsoluteTwilioUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `https://api.twilio.com${pathOrUrl}`;
}

async function fetchPage(url: string, accountSid: string, authToken: string): Promise<TwilioIncomingNumberPage> {
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
    const page = await fetchPage(url, accountSid, authToken);
    const numbers = Array.isArray(page.incoming_phone_numbers) ? page.incoming_phone_numbers : [];
    all.push(...numbers);

    if (!page.next_page_uri) break;
    url = toAbsoluteTwilioUrl(page.next_page_uri);
  }

  return all;
}

function capabilitySummary(capabilities: TwilioIncomingNumber['capabilities']): string {
  if (!capabilities) return 'n/a';
  const enabled = Object.entries(capabilities)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name);
  return enabled.length ? enabled.join(',') : 'none';
}

async function main(): Promise<void> {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');

  const numbers = await listAllIncomingNumbers(accountSid, authToken);

  if (numbers.length === 0) {
    console.log('No incoming phone numbers found on this Twilio account.');
    return;
  }

  console.log(`Found ${numbers.length} purchased Twilio number(s):`);
  for (const number of numbers) {
    console.log(
      `- ${number.phone_number} | sid=${number.sid} | name=${number.friendly_name ?? 'n/a'} | capabilities=${capabilitySummary(number.capabilities ?? null)}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
