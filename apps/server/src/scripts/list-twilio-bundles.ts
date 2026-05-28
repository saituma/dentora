/* eslint-disable no-console */
import 'dotenv/config';
import twilio from 'twilio';

async function main() {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
    status: 'twilio-approved',
  });
  if (bundles.length === 0) {
    console.log('No approved regulatory bundles found.');
    const all = await client.numbers.v2.regulatoryCompliance.bundles.list();
    console.log(`All bundles (${all.length}):`);
    for (const b of all) {
      console.log(`  SID: ${b.sid} | Status: ${b.status} | FriendlyName: ${b.friendlyName}`);
    }
    return;
  }
  for (const b of bundles) {
    console.log(`SID: ${b.sid} | Status: ${b.status} | FriendlyName: ${b.friendlyName}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
