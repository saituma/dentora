import { createHmac, randomBytes } from 'node:crypto';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { AuthenticationError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

// ── Base32 helpers (RFC 4648) ──────────────────────────────────────────────
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── TOTP (RFC 6238) ────────────────────────────────────────────────────────
const TOTP_STEP = 30; // seconds per window
const TOTP_DIGITS = 6;
const TOTP_DRIFT = 1; // accept ±1 window for clock skew

function hotp(keyBuf: Buffer, counter: bigint): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const mac = createHmac('sha1', keyBuf).update(msg).digest();
  const offset = mac[19] & 0xf;
  const truncated =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(truncated % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function totpAt(secret: string, windowOffset = 0): string {
  const counter = BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP) + windowOffset);
  return hotp(base32Decode(secret), counter);
}

function verifyTotp(token: string, secret: string): boolean {
  const clean = token.replace(/\s/g, '');
  for (let drift = -TOTP_DRIFT; drift <= TOTP_DRIFT; drift++) {
    if (clean === totpAt(secret, drift)) return true;
  }
  return false;
}

// ── Recovery codes ─────────────────────────────────────────────────────────
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 5; // 10 hex chars = "XXXXX-XXXXX" format

function generateRecoveryCode(): string {
  const hex = randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase();
  return `${hex.slice(0, 5)}-${hex.slice(5)}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface MfaSetupResult {
  secret: string; // base32 TOTP secret (show to user once, for QR code)
  otpauthUrl: string; // otpauth:// URI for QR code
  recoveryCodes: string[]; // plaintext codes (show to user once)
}

export async function setupMfa(userId: string, email: string): Promise<MfaSetupResult> {
  const secret = base32Encode(randomBytes(20));
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  // Hash recovery codes for storage (bcrypt-like using hashPassword)
  const hashedCodes = await Promise.all(recoveryCodes.map(hashPassword));

  await db
    .update(users)
    .set({
      mfaSecret: secret,
      mfaEnabled: false,
      mfaRecoveryCodes: hashedCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const issuer = 'Dentora';
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;

  logger.info({ userId }, 'MFA setup initiated');
  return { secret, otpauthUrl, recoveryCodes };
}

export async function confirmMfa(userId: string, token: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.mfaSecret) throw new ValidationError('MFA not set up for this user');
  if (user.mfaEnabled) throw new ValidationError('MFA is already enabled');

  if (!verifyTotp(token, user.mfaSecret)) {
    throw new AuthenticationError('Invalid TOTP token');
  }

  await db
    .update(users)
    .set({ mfaEnabled: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
  logger.info({ userId }, 'MFA enabled');
}

export async function disableMfa(userId: string, password: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AuthenticationError('User not found');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new AuthenticationError('Incorrect password');

  await db
    .update(users)
    .set({ mfaSecret: null, mfaEnabled: false, mfaRecoveryCodes: [], updatedAt: new Date() })
    .where(eq(users.id, userId));

  logger.info({ userId }, 'MFA disabled');
}

/**
 * Verifies an MFA challenge during login.
 * Accepts either a 6-digit TOTP token or a recovery code.
 * Returns true if verified; throws AuthenticationError if not.
 */
export async function verifyMfaChallenge(userId: string, token: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.mfaEnabled || !user.mfaSecret) {
    throw new AuthenticationError('MFA not enabled for this user');
  }

  // Try TOTP first
  if (/^\d{6}$/.test(token.replace(/\s/g, ''))) {
    if (verifyTotp(token, user.mfaSecret)) return;
  }

  // Try recovery code
  const normalizedInput = token.replace(/\s/g, '').toUpperCase();
  for (let i = 0; i < user.mfaRecoveryCodes.length; i++) {
    const hashed = user.mfaRecoveryCodes[i];
    if (!hashed) continue;
    const match = await verifyPassword(normalizedInput, hashed);
    if (match) {
      // Invalidate used recovery code
      const updated = [...user.mfaRecoveryCodes];
      updated.splice(i, 1);
      await db
        .update(users)
        .set({ mfaRecoveryCodes: updated, updatedAt: new Date() })
        .where(eq(users.id, userId));
      logger.warn({ userId }, 'MFA recovery code used');
      return;
    }
  }

  throw new AuthenticationError('Invalid MFA token');
}

export async function isMfaRequired(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.mfaEnabled ?? false;
}
