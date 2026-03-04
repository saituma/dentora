
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

export function generateId(): string {
  return randomUUID();
}

export function generateCorrelationId(): string {
  return `corr_${randomUUID().replace(/-/g, '').substring(0, 24)}`;
}
