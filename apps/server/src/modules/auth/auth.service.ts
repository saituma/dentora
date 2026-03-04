
import { db } from '../../db/index.js';
import { users, sessions, tenantUsers, tenantRegistry } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken, generateId } from '../../lib/crypto.js';
import { AuthenticationError, ConflictError } from '../../lib/errors.js';
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

export async function register(input: {
  email: string;
  password: string;
  clinicName: string;
  displayName?: string;
}): Promise<LoginResult> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing) throw new ConflictError('A user with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const userId = generateId();
  const tenantId = generateId();
  const sessionId = generateId();

  // Create tenant, user, and link in a transaction
  const result = await db.transaction(async (tx) => {
    // 1. Create tenant
    await tx.insert(tenantRegistry).values({
      id: tenantId,
      clinicName: input.clinicName,
      clinicSlug: input.clinicName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + userId.slice(0, 6),
      plan: 'starter',
      status: 'active',
    });

    // 2. Create user
    const [user] = await tx.insert(users).values({
      id: userId,
      email: input.email,
      passwordHash,
      displayName: input.displayName ?? input.clinicName,
      role: 'admin',
    }).returning();

    // 3. Link user to tenant
    await tx.insert(tenantUsers).values({
      id: generateId(),
      tenantId,
      userId,
      role: 'admin',
    });

    // 4. Create tokens
    const accessToken = signAccessToken({
      userId,
      role: 'admin',
      tenantId,
    });

    const refreshToken = signRefreshToken({ userId, tenantId, sessionId });

    // 5. Create session
    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      userAgent: null,
      ipAddress: null,
    });

    return { accessToken, refreshToken, user };
  });

  logger.info({ userId, tenantId, clinicName: input.clinicName }, 'User registered');

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      role: result.user.role,
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
