import { createHmac } from 'node:crypto';
import { encrypt, decrypt } from './encryption.js';
import { env } from '../config/env.js';

/**
 * Deterministic HMAC-SHA256 of a value for use in database indexes and exact lookups.
 * Normalises to lowercase + trim so lookups are case/whitespace insensitive.
 */
export function hashForSearch(value: string): string {
  return createHmac('sha256', env.ENCRYPTION_KEY).update(value.toLowerCase().trim()).digest('hex');
}

/** Encrypts a nullable string field. Returns null unchanged. */
export function encryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  return encrypt(value);
}

/**
 * Decrypts a nullable string field.
 * Returns null unchanged. Handles legacy plaintext rows gracefully:
 * if the value doesn't match the `iv:tag:ciphertext` format it is returned as-is.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.includes(':')) return value; // plaintext row from before encryption was applied
  try {
    return decrypt(value);
  } catch {
    return value; // tampered or corrupt — return raw rather than crashing
  }
}
