import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, maskApiKey } from './encryption.js';

describe('encrypt / decrypt', () => {
  it('round-trips a plaintext string', () => {
    const plaintext = 'sk-proj-abc123secret';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const e1 = encrypt('same-value');
    const e2 = encrypt('same-value');
    expect(e1).not.toBe(e2);
    expect(decrypt(e1)).toBe('same-value');
    expect(decrypt(e2)).toBe('same-value');
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('handles unicode', () => {
    const text = 'café 🦷 日本語';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    parts[2] = 'ff'.repeat(parts[2].length / 2);
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws on invalid format', () => {
    expect(() => decrypt('not-valid')).toThrow('Invalid encrypted payload format');
    expect(() => decrypt('a:b')).toThrow('Invalid encrypted payload format');
  });
});

describe('maskApiKey', () => {
  it('masks all but last 4 chars', () => {
    expect(maskApiKey('sk-proj-abc123XY')).toBe('****23XY');
  });

  it('returns **** for short keys', () => {
    expect(maskApiKey('abc')).toBe('****');
    expect(maskApiKey('abcd')).toBe('****');
  });

  it('shows last 4 of longer key', () => {
    expect(maskApiKey('12345')).toBe('****2345');
  });
});
