/* eslint-disable no-console */
import 'dotenv/config';
import { verifyPassword } from '../lib/crypto.js';

async function main() {
  const stored =
    'pbkdf2:100000:ae8afecaa925775ca151ad505ce66ebf:14f09fcd6ad0ba135ea432588c836a302882fa0f4a5b0db1cb22aea0da5781242ad4cea8c5c4baeb9bbb68dfc8a4d4dc8d5eff51f0f20e6d51335ae36047a4c7';
  const result = await verifyPassword('Password123!', stored);
  console.log('verify result:', result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
