
import { db } from '../../db/index.js';
import { users, sessions, tenantUsers } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken, generateId } from '../../lib/crypto.js';
import { AuthenticationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
  };
  tenantId: string | null;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) throw new AuthenticationError('Invalid email or password');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new AuthenticationError('Invalid email or password');

  const [tenantLink] = await db
    .select({ tenantId: tenantUsers.tenantId })
    .from(tenantUsers)
    .where(eq(tenantUsers.userId, user.id))
    .limit(1);

  const tenantId = tenantLink?.tenantId ?? null;

  const sessionId = generateId();

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    tenantId,
  });

  const refreshToken = signRefreshToken({ userId: user.id, tenantId: tenantId ?? '', sessionId });

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: null,
    ipAddress: null,
  });

  logger.info({ userId: user.id, tenantId }, 'User logged in');

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
    tenantId,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyRefreshToken(refreshToken) as any;
  if (!payload?.userId) throw new AuthenticationError('Invalid refresh token');

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, payload.userId), eq(sessions.refreshToken, refreshToken)))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    throw new AuthenticationError('Session expired');
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) throw new AuthenticationError('User not found');

  const [tenantLink] = await db
    .select({ tenantId: tenantUsers.tenantId })
    .from(tenantUsers)
    .where(eq(tenantUsers.userId, user.id))
    .limit(1);

  const tenantId = tenantLink?.tenantId ?? null;

  const newAccessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    tenantId,
  });

  const newRefreshToken = signRefreshToken({ userId: user.id, tenantId: tenantId ?? '', sessionId: session.id });

  await db
    .update(sessions)
    .set({
      refreshToken: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .where(eq(sessions.id, session.id));

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string, refreshToken: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.refreshToken, refreshToken)));

  logger.info({ userId }, 'User logged out');
}
