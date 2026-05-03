
import { db } from '../../db/index.js';
import { users, sessions, tenantUsers, tenantRegistry, otpChallenges, authIdentities, passwordResetTokens } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken, generateId } from '../../lib/crypto.js';
import { AuthenticationError, ConflictError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import twilio from 'twilio';
import { createHash, randomInt, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

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

interface GoogleAuthState {
  returnTo?: string;
}

function normalizePhoneNumber(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function maskOtpTarget(target: string): string {
  if (target.includes('@')) {
    const [local, domain] = target.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${target.slice(0, 4)}***${target.slice(-2)}`;
}

function isGoogleAuthConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_AUTH_REDIRECT_URI,
  );
}

function encodeGoogleAuthState(payload: GoogleAuthState): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '10m',
    issuer: env.JWT_ISSUER,
    subject: 'google-auth-state',
  });
}

function decodeGoogleAuthState(state: string | undefined): GoogleAuthState | null {
  if (!state) return null;
  try {
    const decoded = jwt.verify(state, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
      subject: 'google-auth-state',
    });
    return decoded as GoogleAuthState;
  } catch {
    return null;
  }
}

function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function issueLoginSession(user: typeof users.$inferSelect): Promise<LoginResult> {
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
  const sessionExpiryMs = env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshToken,
    expiresAt: new Date(Date.now() + sessionExpiryMs),
    userAgent: null,
    ipAddress: null,
  });

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

async function createUserWithTenant(input: {
  email: string;
  passwordHash: string;
  clinicName: string;
  displayName?: string;
  role?: 'admin' | 'owner';
}): Promise<typeof users.$inferSelect> {
  const userId = generateId();
  const tenantId = generateId();

  const role = input.role ?? 'admin';

  const [user] = await db.transaction(async (tx) => {
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

    const [createdUser] = await tx.insert(users).values({
      id: userId,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? input.clinicName,
      role,
      emailVerified: true,
    }).returning();

    await tx.insert(tenantUsers).values({
      id: generateId(),
      tenantId,
      userId,
      role: 'admin',
    });

    return [createdUser];
  });

  return user;
}

async function sendEmailOtpViaSmtp(input: {
  email: string;
  code: string;
}): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new ValidationError('SMTP is not configured for email verification');
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: 'Your Dentora verification code',
    text: `Your Dentora verification code is ${input.code}. It expires in 10 minutes.`,
    html: `<p>Your Dentora verification code is <strong>${input.code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
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

  const result = await issueLoginSession(user);
  logger.info({ userId: user.id, tenantId: result.tenantId }, 'User logged in');
  return result;
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
  let user: typeof users.$inferSelect;
  try {
    user = await createUserWithTenant({
      email: input.email,
      passwordHash,
      clinicName: input.clinicName,
      displayName: input.displayName,
    });
    await db.insert(authIdentities).values({
      id: generateId(),
      userId: user.id,
      provider: 'email',
      providerUserId: input.email.toLowerCase(),
      verified: true,
    });
  } catch (err: unknown) {
    if (isPostgresUniqueViolation(err)) {
      throw new ConflictError(
        'That email or clinic URL is already in use. Try signing in, or use a different email or clinic name.',
      );
    }
    throw err;
  }

  const result = await issueLoginSession(user);
  logger.info({ userId: user.id, tenantId: result.tenantId, clinicName: input.clinicName }, 'User registered');
  return result;
}

export async function sendEmailOtp(input: { email: string }): Promise<{ challengeId: string; expiresInSeconds: number }> {
  const email = input.email.trim().toLowerCase();
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresInSeconds = 10 * 60;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const challengeId = generateId();
  await db.insert(otpChallenges).values({
    id: challengeId,
    channel: 'email',
    target: email,
    codeHash,
    expiresAt,
    attempts: 0,
    consumedAt: null,
    metadata: {},
  });

  await sendEmailOtpViaSmtp({ email, code });
  logger.info({ email: maskOtpTarget(email) }, 'Email OTP sent');
  return { challengeId, expiresInSeconds };
}

export async function verifyEmailOtpAndRegister(input: {
  email: string;
  code: string;
  clinicName?: string;
  displayName?: string;
  password?: string;
}): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.channel, 'email'), eq(otpChallenges.target, email)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge || challenge.channel !== 'email' || challenge.target !== email) {
    throw new ValidationError('OTP challenge not found');
  }
  if (challenge.consumedAt) throw new ValidationError('OTP already used');
  if (challenge.expiresAt < new Date()) throw new ValidationError('OTP expired');
  if (challenge.attempts >= 5) throw new ValidationError('Too many invalid OTP attempts');

  const expected = challenge.codeHash ?? '';
  if (!expected || hashOtpCode(input.code.trim()) !== expected) {
    await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
    throw new ValidationError('Invalid OTP code');
  }

  await db.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = existing;
  if (!user) {
    if (!input.clinicName?.trim()) {
      throw new ValidationError('clinicName is required for new account signup');
    }
    const passwordToHash = input.password?.trim() || generateId();
    const passwordHash = await hashPassword(passwordToHash);
    user = await createUserWithTenant({
      email,
      passwordHash,
      clinicName: input.clinicName.trim(),
      displayName: input.displayName,
    });
  } else {
    await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  await db.insert(authIdentities).values({
    id: generateId(),
    userId: user.id,
    provider: 'email',
    providerUserId: email,
    verified: true,
  }).onConflictDoUpdate({
    target: [authIdentities.provider, authIdentities.providerUserId],
    set: { verified: true, updatedAt: new Date() },
  });

  return await issueLoginSession(user);
}

function getTwilioVerifyClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SERVICE_SID) {
    throw new ValidationError('Twilio Verify is not configured');
  }
  return {
    client: twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
    serviceSid: env.TWILIO_VERIFY_SERVICE_SID,
  };
}

export async function sendPhoneOtp(input: { phoneNumber: string }): Promise<{ status: string }> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const { client, serviceSid } = getTwilioVerifyClient();
  await client.verify.v2.services(serviceSid).verifications.create({
    to: phoneNumber,
    channel: 'sms',
  });
  return { status: 'pending' };
}

export async function verifyPhoneOtpAndRegister(input: {
  phoneNumber: string;
  code: string;
  clinicName: string;
  displayName?: string;
}): Promise<LoginResult> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const { client, serviceSid } = getTwilioVerifyClient();

  const check = await client.verify.v2.services(serviceSid).verificationChecks.create({
    to: phoneNumber,
    code: input.code.trim(),
  });

  if (check.status !== 'approved') {
    throw new ValidationError('Invalid or expired phone OTP');
  }

  const [existingIdentity] = await db
    .select()
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, 'phone'), eq(authIdentities.providerUserId, phoneNumber)))
    .limit(1);

  let user: typeof users.$inferSelect;
  if (existingIdentity) {
    const [existingUser] = await db.select().from(users).where(eq(users.id, existingIdentity.userId)).limit(1);
    if (!existingUser) throw new AuthenticationError('Linked user not found');
    user = existingUser;
  } else {
    const syntheticEmail = `${phoneNumber.replace(/[^\d+]/g, '').replace('+', '')}@phone.local`;
    const randomPasswordHash = await hashPassword(generateId());
    user = await createUserWithTenant({
      email: syntheticEmail,
      passwordHash: randomPasswordHash,
      clinicName: input.clinicName,
      displayName: input.displayName ?? `User ${maskOtpTarget(phoneNumber)}`,
    });
  }

  await db.insert(authIdentities).values({
    id: generateId(),
    userId: user.id,
    provider: 'phone',
    providerUserId: phoneNumber,
    verified: true,
  }).onConflictDoUpdate({
    target: [authIdentities.provider, authIdentities.providerUserId],
    set: { userId: user.id, verified: true, updatedAt: new Date() },
  });

  return await issueLoginSession(user);
}

export function createGoogleOauthStartUrl(input: { returnTo?: string }): string {
  if (!isGoogleAuthConfigured()) {
    throw new ValidationError('Google OAuth is not configured');
  }

  const state = encodeGoogleAuthState({
    returnTo: input.returnTo,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_AUTH_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function loginOrRegisterWithGoogleCode(input: {
  code: string;
  state?: string;
}): Promise<{ loginResult: LoginResult; returnTo?: string | null }> {
  if (!isGoogleAuthConfigured()) {
    throw new ValidationError('Google OAuth is not configured');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_AUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const message = await tokenResponse.text();
    throw new ValidationError(`Google token exchange failed: ${message.slice(0, 240)}`);
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string; id_token?: string };
  if (!tokenPayload.access_token) {
    throw new ValidationError('Google token response missing access_token');
  }

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    const message = await userInfoResponse.text();
    throw new ValidationError(`Google userinfo failed: ${message.slice(0, 240)}`);
  }

  const userInfo = await userInfoResponse.json() as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!userInfo.sub || !userInfo.email) {
    throw new ValidationError('Google user profile is missing required fields');
  }
  if (!userInfo.email_verified) {
    throw new ValidationError('Google account email is not verified');
  }

  const providerUserId = userInfo.sub;
  const email = userInfo.email.toLowerCase();
  const displayName = userInfo.name ?? email.split('@')[0];

  const [existingIdentity] = await db
    .select()
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, 'google'), eq(authIdentities.providerUserId, providerUserId)))
    .limit(1);

  let user: typeof users.$inferSelect;
  if (existingIdentity) {
    const [existingUser] = await db.select().from(users).where(eq(users.id, existingIdentity.userId)).limit(1);
    if (!existingUser) throw new AuthenticationError('Linked Google user not found');
    user = existingUser;
  } else {
    const [existingUserByEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUserByEmail) {
      user = existingUserByEmail;
    } else {
      const randomPasswordHash = await hashPassword(generateId());
      user = await createUserWithTenant({
        email,
        passwordHash: randomPasswordHash,
        clinicName: displayName,
        displayName,
      });
    }
  }

  await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id));

  await db.insert(authIdentities).values({
    id: generateId(),
    userId: user.id,
    provider: 'google',
    providerUserId,
    verified: true,
  }).onConflictDoUpdate({
    target: [authIdentities.provider, authIdentities.providerUserId],
    set: { userId: user.id, verified: true, updatedAt: new Date() },
  });

  const statePayload = decodeGoogleAuthState(input.state);
  const loginResult = await issueLoginSession(user);
  return { loginResult, returnTo: statePayload?.returnTo ?? null };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
  if (!payload?.userId) throw new AuthenticationError('Invalid refresh token');

  // First, try to find a session where this token is the current refresh token
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, payload.userId), eq(sessions.refreshToken, refreshToken)))
    .limit(1);

  if (session) {
    if (session.expiresAt < new Date()) {
      throw new AuthenticationError('Session expired');
    }
  } else {
    // Token doesn't match any current session token.
    // Check if it matches a previously-rotated token — this indicates a replay attack.
    const [compromisedSession] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, payload.userId), eq(sessions.previousRefreshToken, refreshToken)))
      .limit(1);

    if (compromisedSession) {
      // Replay attack detected: an already-rotated token is being reused.
      // Invalidate ALL sessions for this user as a security measure.
      await db.delete(sessions).where(eq(sessions.userId, payload.userId));
      logger.warn(
        { userId: payload.userId, sessionId: compromisedSession.id },
        'Refresh token replay detected — all sessions invalidated',
      );
      throw new AuthenticationError('Refresh token reuse detected. All sessions have been revoked for security.');
    }

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
  const sessionExpiryMs = env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  // Rotate: store old token as previous, set new token as current
  await db
    .update(sessions)
    .set({
      previousRefreshToken: refreshToken,
      refreshToken: newRefreshToken,
      rotatedAt: new Date(),
      expiresAt: new Date(Date.now() + sessionExpiryMs),
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

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  const validCurrentPassword = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!validCurrentPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await db
    .update(users)
    .set({
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));

  logger.info({ userId: input.userId }, 'User password changed');
}

export async function requestPasswordReset(input: { email: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return;
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    id: generateId(),
    userId: user.id,
    tokenHash,
    expiresAt,
    consumedAt: null,
  });

  await sendPasswordResetEmail({ email, token });
  logger.info({ email: maskOtpTarget(email) }, 'Password reset requested');
}

export async function resetPassword(input: { token: string; newPassword: string }): Promise<void> {
  const tokenHash = createHash('sha256').update(input.token).digest('hex');

  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!resetToken) throw new ValidationError('Invalid or expired reset token');
  if (resetToken.consumedAt) throw new ValidationError('This reset link has already been used');
  if (resetToken.expiresAt < new Date()) throw new ValidationError('This reset link has expired');

  const newPasswordHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, resetToken.userId));

    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    await tx
      .delete(sessions)
      .where(eq(sessions.userId, resetToken.userId));
  });

  logger.info({ userId: resetToken.userId }, 'Password reset completed');
}

async function sendPasswordResetEmail(input: { email: string; token: string }): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new ValidationError('SMTP is not configured for password reset emails');
  }

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${input.token}`;

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: 'Reset your Dentora password',
    text: `You requested a password reset. Click this link to set a new password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to set a new password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  });
}
