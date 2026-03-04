
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING = 'hex' as const;

/**
 * Derives the 32-byte encryption key from the hex-encoded ENCRYPTION_KEY env var.
 * The env var must be exactly 64 hex characters (= 32 bytes).
 */
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (all hex-encoded).
 *
 * Security notes:
 * - Random IV per encryption ensures identical plaintexts produce different ciphertexts.
 * - GCM provides both confidentiality and authenticity (tamper detection).
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`;
}

/**
 * Decrypts a ciphertext string produced by `encrypt()`.
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
 */
export function decrypt(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, ENCODING);
  const authTag = Buffer.from(authTagHex, ENCODING);
  const key = getKey();

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Creates a masked hint from an API key for display purposes.
 * Shows only the last 4 characters: "sk-...ab1X" → "****ab1X"
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) {
    return '****';
  }
  return `****${apiKey.slice(-4)}`;
}
