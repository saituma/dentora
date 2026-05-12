/**
 * Secret rotation script — rotates JWT_SECRET and ENCRYPTION_KEY with a grace period.
 *
 * ENCRYPTION_KEY rotation is a two-phase process:
 *   Phase 1 (this script): generates new key, prints it. Set NEW_ENCRYPTION_KEY env var.
 *   Phase 2 (manual): re-encrypt all PHI rows using both keys (old for decrypt, new for encrypt).
 *   Phase 3: replace ENCRYPTION_KEY with new value, remove NEW_ENCRYPTION_KEY.
 *
 * JWT_SECRET rotation takes effect immediately — all existing refresh tokens are invalidated.
 * Warn users to log in again if possible before rotating.
 *
 * Usage:
 *   npx tsx apps/server/scripts/rotate-secrets.ts [--jwt] [--encryption-key]
 */

import { randomBytes } from 'crypto';

const args = process.argv.slice(2);
const rotateJwt = args.includes('--jwt') || args.length === 0;
const rotateEncKey = args.includes('--encryption-key') || args.length === 0;

console.log('=== Dentora Secret Rotation ===\n');
console.log('WARNING: Rotating secrets affects all active sessions and encrypted data.');
console.log('Coordinate this with a maintenance window.\n');

if (rotateJwt) {
  const newJwtSecret = randomBytes(64).toString('hex');
  console.log('--- JWT_SECRET rotation ---');
  console.log('Effect: ALL refresh tokens are immediately invalidated (users must log in again).');
  console.log('Grace period: none — takes effect on next token verification.\n');
  console.log(`New JWT_SECRET (128 hex chars):\n${newJwtSecret}\n`);
  console.log('Steps:');
  console.log('  1. Update JWT_SECRET in .env.production on the server');
  console.log('  2. Restart the server: docker-compose -f docker-compose.prod.yaml restart server');
  console.log('  3. Notify users that they will need to log in again\n');
}

if (rotateEncKey) {
  const newEncKey = randomBytes(32).toString('hex');
  console.log('--- ENCRYPTION_KEY rotation ---');
  console.log('Effect: New PHI writes use the new key. Old rows still encrypted with old key.');
  console.log('You MUST re-encrypt existing rows or keep the old key available for decryption.\n');
  console.log(`New ENCRYPTION_KEY (64 hex chars):\n${newEncKey}\n`);
  console.log('Steps:');
  console.log('  1. Set NEW_ENCRYPTION_KEY=<above> in .env.production alongside existing ENCRYPTION_KEY');
  console.log('  2. Run the re-encryption migration: npx tsx apps/server/scripts/reencrypt-phi.ts');
  console.log('  3. Once migration is verified: set ENCRYPTION_KEY=<above>, remove NEW_ENCRYPTION_KEY');
  console.log('  4. Restart all server and worker containers');
  console.log('  5. Verify decryption works: GET /api/patients returns readable names\n');
  console.log('DO NOT remove the old ENCRYPTION_KEY until re-encryption is confirmed complete.\n');
}

console.log('Audit recommendation: record this rotation in your security log with the date and operator name.');
