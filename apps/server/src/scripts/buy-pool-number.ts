/* eslint-disable no-console */
import 'dotenv/config';
import { buyPoolNumber } from '../modules/telephony/telephony.service.js';

async function main() {
  const countryCode = process.argv[2] ?? 'GB';
  console.log(`Buying pool number in country: ${countryCode}`);
  const number = await buyPoolNumber(countryCode);
  console.log('Purchased:', JSON.stringify(number, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
