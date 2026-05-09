import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: 'development' as 'development' | 'staging' | 'production',
  CLIENT_URL: 'http://localhost:3000',
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
}));

const mockAuthService = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  verifyEmailOtpAndRegister: vi.fn(),
  verifyPhoneOtpAndRegister: vi.fn(),
  exchangeOauthCode: vi.fn(),
  refreshAccessToken: vi.fn(),
  logout: vi.fn(),
  sendEmailOtp: vi.fn(),
  sendPhoneOtp: vi.fn(),
  createGoogleOauthStartUrl: vi.fn(),
  loginOrRegisterWithGoogleCode: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  setPassword: vi.fn(),
  getUserAccountInfo: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({ env: mockEnv }));
vi.mock('./auth.service.js', () => mockAuthService);
vi.mock('../../middleware/rateLimit.js', () => ({
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../middleware/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/validate.js')>('../../middleware/validate.js');
  return {
    validate: actual.validate,
    authenticateJwt: (req: { user?: { userId: string; role: string; tenantId: string } }, _res: unknown, next: () => void) => {
      req.user = { userId: 'u1', role: 'admin', tenantId: 't1' };
      next();
    },
  };
});

import { authRouter } from './auth.routes.js';

const loginResult = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token-1',
  user: {
    id: 'u1',
    email: 'user@example.com',
    displayName: 'User',
    role: 'admin',
  },
  tenantId: 't1',
};

function expectRefreshCookie(setCookie: string | null, value: string): void {
  expect(setCookie).toContain(`refresh-token=${value}`);
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Lax');
  expect(setCookie).toContain('Path=/api/auth');
  expect(setCookie).toContain('Max-Age=604800');
}

interface RouterResponse {
  statusCode: number;
  body: unknown;
  headers: Map<string, string[]>;
}

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(this: FakeResponse, code: number): FakeResponse;
  cookie(this: FakeResponse, name: string, value: string, options: Record<string, unknown>): FakeResponse;
  clearCookie(this: FakeResponse, name: string, options: Record<string, unknown>): FakeResponse;
  json(this: FakeResponse, body: unknown): FakeResponse;
}

function appendHeader(headers: Map<string, string[]>, name: string, value: string): void {
  const key = name.toLowerCase();
  headers.set(key, [...(headers.get(key) ?? []), value]);
}

function serializeCookie(name: string, value: string, options: Record<string, unknown> = {}): string {
  const parts = [`${name}=${value}`];
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (typeof options.path === 'string') parts.push(`Path=${options.path}`);
  if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) {
    const sameSite = String(options.sameSite);
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  }
  return parts.join('; ');
}

async function request(path: string, input: {
  method: string;
  body?: unknown;
  cookies?: Record<string, string>;
}): Promise<RouterResponse> {
  return await new Promise((resolve) => {
    const headers = new Map<string, string[]>();
    const req = {
      method: input.method,
      url: path,
      originalUrl: path,
      path,
      headers: {},
      ip: '127.0.0.1',
      body: input.body ?? {},
      cookies: input.cookies ?? {},
    } as unknown as Request;

    const res: FakeResponse = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      cookie(name: string, value: string, options: Record<string, unknown>) {
        appendHeader(headers, 'set-cookie', serializeCookie(name, value, options));
        return this;
      },
      clearCookie(name: string, options: Record<string, unknown>) {
        appendHeader(headers, 'set-cookie', serializeCookie(name, '', {
          ...options,
          expires: new Date(0),
        }));
        return this;
      },
      json(body: unknown) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body, headers });
        return this;
      },
      body: undefined as unknown,
    };

    (authRouter as unknown as { handle: (req: Request, res: Response, next: NextFunction) => void }).handle(req, res as unknown as Response, ((err?: unknown) => {
      if (err) {
        const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 401;
        resolve({ statusCode: Number.isFinite(statusCode) ? statusCode : 401, body: err, headers });
      }
      else resolve({ statusCode: res.statusCode, body: undefined, headers });
    }) as NextFunction);
  });
}

describe('auth refresh-token cookie routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.NODE_ENV = 'development';
    mockEnv.REFRESH_TOKEN_EXPIRY_DAYS = 7;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'login',
      path: '/login',
      status: 200,
      body: { email: 'user@example.com', password: 'password123' },
      mock: mockAuthService.login,
    },
    {
      name: 'register',
      path: '/register',
      status: 201,
      body: { email: 'user@example.com', password: 'password123', clinicName: 'Clinic' },
      mock: mockAuthService.register,
    },
    {
      name: 'email OTP verify',
      path: '/email/verify-otp',
      status: 200,
      body: { email: 'user@example.com', code: '123456', clinicName: 'Clinic' },
      mock: mockAuthService.verifyEmailOtpAndRegister,
    },
    {
      name: 'phone OTP verify',
      path: '/phone/verify-otp',
      status: 200,
      body: { phoneNumber: '+15555550123', code: '123456', clinicName: 'Clinic' },
      mock: mockAuthService.verifyPhoneOtpAndRegister,
    },
  ])('sets the refresh cookie on successful $name auth issuance', async ({ path, status, body, mock }) => {
    mock.mockResolvedValue(loginResult);

    const response = await request(path, {
      method: 'POST',
      body,
    });

    expect(response.statusCode).toBe(status);
    expectRefreshCookie(response.headers.get('set-cookie')?.join(', ') ?? null, loginResult.refreshToken);
    expect(response.body).toMatchObject({
      accessToken: loginResult.accessToken,
    });
    expect(response.body).not.toHaveProperty('refreshToken');
  });

  it('sets the refresh cookie on successful Google OAuth exchange', async () => {
    mockAuthService.exchangeOauthCode.mockResolvedValue(loginResult);

    const response = await request('/google/exchange', {
      method: 'POST',
      cookies: { 'oauth-exchange-code': 'oauth-code' },
    });

    expect(response.statusCode).toBe(200);
    const setCookie = response.headers.get('set-cookie')?.join(', ') ?? null;
    expectRefreshCookie(setCookie, loginResult.refreshToken);
    expect(setCookie).toContain('oauth-exchange-code=');
  });

  it('reads refresh token only from the cookie and rotates the cookie', async () => {
    mockAuthService.refreshAccessToken.mockResolvedValue({
      accessToken: 'access-token-2',
      refreshToken: 'refresh-token-2',
    });

    const response = await request('/refresh', {
      method: 'POST',
      cookies: { 'refresh-token': 'cookie-refresh-token' },
      body: { refreshToken: 'ignored-body-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith('cookie-refresh-token');
    expectRefreshCookie(response.headers.get('set-cookie')?.join(', ') ?? null, 'refresh-token-2');
    expect(response.body).toEqual({
      accessToken: 'access-token-2',
    });
  });

  it('rejects refresh when only a body refresh token is present', async () => {
    mockAuthService.refreshAccessToken.mockResolvedValue({
      accessToken: 'access-token-2',
      refreshToken: 'refresh-token-2',
    });

    const response = await request('/refresh', {
      method: 'POST',
      body: { refreshToken: 'body-refresh-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(mockAuthService.refreshAccessToken).not.toHaveBeenCalled();
    const setCookie = response.headers.get('set-cookie')?.join(', ') ?? null;
    expect(setCookie).toContain('refresh-token=');
    expect(setCookie).toContain('Path=/api/auth');
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('logs out with cookie refresh token and clears the cookie', async () => {
    mockAuthService.logout.mockResolvedValue(undefined);

    const response = await request('/logout', {
      method: 'POST',
      cookies: { 'refresh-token': 'cookie-refresh-token' },
      body: { refreshToken: 'ignored-body-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockAuthService.logout).toHaveBeenCalledWith('u1', 'cookie-refresh-token');
    const setCookie = response.headers.get('set-cookie')?.join(', ') ?? null;
    expect(setCookie).toContain('refresh-token=');
    expect(setCookie).toContain('Path=/api/auth');
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('rejects logout when only a body refresh token is present', async () => {
    mockAuthService.logout.mockResolvedValue(undefined);

    const response = await request('/logout', {
      method: 'POST',
      body: { refreshToken: 'body-refresh-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(mockAuthService.logout).not.toHaveBeenCalled();
    const setCookie = response.headers.get('set-cookie')?.join(', ') ?? null;
    expect(setCookie).toContain('refresh-token=');
    expect(setCookie).toContain('Path=/api/auth');
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});
