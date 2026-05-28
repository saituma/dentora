/* eslint-disable no-console */
import 'dotenv/config';
import twilio from 'twilio';

async function main() {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const addresses = await client.addresses.list();
  if (addresses.length === 0) {
    console.log('No addresses registered on this Twilio account.');
    return;
  }
  for (const a of addresses) {
    console.log(`SID: ${a.sid}`);
    console.log(`  Name: ${a.friendlyName}`);
    console.log(`  Address: ${a.street}, ${a.city}, ${a.region} ${a.postalCode}, ${a.isoCountry}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
