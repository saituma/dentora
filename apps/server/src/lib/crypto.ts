import jwt from 'jsonwebtoken';
import { createHmac, randomUUID, pbkdf2, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

// PBKDF2-SHA256 — native OpenSSL, no compilation needed
// 100k iterations calibrated for ~200ms on Heroku Basic dyno (0.2 CPU cores)
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha256';

function pbkdf2Hash(password: string, salt: string, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, hash) => {
      if (err) reject(err);
      else resolve(hash);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Legacy bcrypt hashes (backward compat)
  if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
    const { default: bcryptjs } = await import('bcryptjs');
    return bcryptjs.compare(password, stored);
  }
  // Legacy scrypt hashes
  if (stored.startsWith('scrypt:')) {
    const { scrypt } = await import('crypto');
    const [, N, r, p, salt, hashHex] = stored.split(':');
    const hash = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        PBKDF2_KEYLEN,
        { N: Number(N), r: Number(r), p: Number(p) },
        (err, h) => {
          if (err) reject(err);
          else resolve(h);
        },
      );
    });
    return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
  }
  // PBKDF2 hashes: pbkdf2:{iterations}:{salt}:{hash}
  const [, iterations, salt, hashHex] = stored.split(':');
  const hash = await pbkdf2Hash(password, salt, Number(iterations));
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
