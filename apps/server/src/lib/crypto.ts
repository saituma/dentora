import jwt from 'jsonwebtoken';
import { createHmac, randomUUID, scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

// OWASP-recommended scrypt params (~200-400ms on constrained hardware, no native compilation needed)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function scryptHash(
  password: string,
  salt: string,
  N: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, { N, r, p }, (err, hash) => {
      if (err) reject(err);
      else resolve(hash);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptHash(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Legacy bcrypt hashes (backward compat during migration)
  if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
    const { default: bcryptjs } = await import('bcryptjs');
    return bcryptjs.compare(password, stored);
  }
  const [, N, r, p, salt, hashHex] = stored.split(':');
  const hash = await scryptHash(password, salt, Number(N), Number(r), Number(p));
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tenantId: string;
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRY_SECONDS,
    issuer: env.JWT_ISSUER,
    subject: payload.userId,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
  });
  return decoded as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_EXPIRY_DAYS}d`,
    issuer: env.JWT_ISSUER,
    subject: payload.userId,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
  });
  return decoded as RefreshTokenPayload;
}

export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(token).digest('hex');
}

export function generateId(): string {
  return randomUUID();
}

export function generateCorrelationId(): string {
  return `corr_${randomUUID().replace(/-/g, '').substring(0, 24)}`;
}
