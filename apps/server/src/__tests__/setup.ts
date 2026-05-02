import { vi } from 'vitest';

vi.stubEnv('NODE_ENV', 'development');
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
vi.stubEnv('JWT_SECRET', 'test-secret-that-is-at-least-32-characters-long');
vi.stubEnv('JWT_ISSUER', 'dental-flow-test');
vi.stubEnv('JWT_EXPIRY_SECONDS', '900');
vi.stubEnv('REFRESH_TOKEN_EXPIRY_DAYS', '7');
vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
vi.stubEnv('REDIS_DISABLED', 'true');
vi.stubEnv('SENTRY_DSN', '');
vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000');

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  createTenantLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createCallLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../lib/cache.js', () => ({
  getRedis: vi.fn().mockReturnValue({
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]),
    }),
  }),
  getCachedPhoneMapping: vi.fn().mockResolvedValue(null),
  cachePhoneMapping: vi.fn().mockResolvedValue(undefined),
  tenantCacheGet: vi.fn().mockResolvedValue(null),
  tenantCacheSet: vi.fn().mockResolvedValue(undefined),
}));
