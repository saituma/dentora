import { describe, expect, it } from 'vitest';
import {
  getDentallyEnvFatalErrors,
  getProductionEnvFatalErrors,
  isDefaultOrLocalRedisUrl,
  shouldFailStartupOnRedisError,
  type Env,
} from './env.js';

const productionConfig: Pick<
  Env,
  | 'NODE_ENV'
  | 'JWT_SECRET'
  | 'ENCRYPTION_KEY'
  | 'DATABASE_URL'
  | 'DATABASE_SSL_MODE'
  | 'REDIS_DISABLED'
  | 'REDIS_URL'
> = {
  NODE_ENV: 'production',
  JWT_SECRET: 'production-secret-that-is-at-least-32-characters',
  ENCRYPTION_KEY: 'a'.repeat(64),
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app',
  DATABASE_SSL_MODE: 'require',
  REDIS_DISABLED: false,
  REDIS_URL: 'redis://redis.example.com:6379',
};

const dentallyConfig: Pick<
  Env,
  | 'ENABLE_DENTALLY'
  | 'DENTALLY_VERIFICATION_ENABLED'
  | 'DENTALLY_SANDBOX_MODE'
  | 'DENTALLY_ALLOW_SANDBOX_WRITES'
  | 'DENTALLY_API_BASE_URL'
  | 'DENTALLY_CONTROLLED_PILOT'
  | 'DENTALLY_PILOT_TENANT_IDS'
  | 'DENTALLY_PILOT_INTEGRATION_IDS'
> = {
  ENABLE_DENTALLY: true,
  DENTALLY_VERIFICATION_ENABLED: true,
  DENTALLY_SANDBOX_MODE: false,
  DENTALLY_ALLOW_SANDBOX_WRITES: true,
  DENTALLY_API_BASE_URL: 'https://api.sandbox.dentally.co',
  DENTALLY_CONTROLLED_PILOT: false,
  DENTALLY_PILOT_TENANT_IDS: '',
  DENTALLY_PILOT_INTEGRATION_IDS: '',
};

describe('Redis production environment validation', () => {
  it('rejects REDIS_DISABLED=true in production', () => {
    const errors = getProductionEnvFatalErrors({
      ...productionConfig,
      REDIS_DISABLED: true,
    });

    expect(errors).toContain('REDIS_DISABLED must not be true in production');
  });

  it.each(['redis://localhost:6379', 'redis://127.0.0.1:6379', 'localhost', '127.0.0.1'])(
    'rejects local Redis URL %s in production',
    (redisUrl) => {
      const errors = getProductionEnvFatalErrors({
        ...productionConfig,
        REDIS_URL: redisUrl,
      });

      expect(errors).toContain('REDIS_URL must point to a remote Redis instance in production');
    },
  );

  it('allows local Redis and disabled Redis outside production', () => {
    const errors = getProductionEnvFatalErrors({
      ...productionConfig,
      NODE_ENV: 'development',
      REDIS_DISABLED: true,
      REDIS_URL: 'redis://localhost:6379',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DATABASE_SSL_MODE: 'disable',
    });

    expect(errors).toEqual([]);
  });

  it('allows a remote Redis URL in production', () => {
    expect(getProductionEnvFatalErrors(productionConfig)).toEqual([]);
  });

  it('detects default and local Redis hosts', () => {
    expect(isDefaultOrLocalRedisUrl('redis://localhost:6379')).toBe(true);
    expect(isDefaultOrLocalRedisUrl('redis://127.0.0.1:6379')).toBe(true);
    expect(isDefaultOrLocalRedisUrl('localhost')).toBe(true);
    expect(isDefaultOrLocalRedisUrl('127.0.0.1')).toBe(true);
    expect(isDefaultOrLocalRedisUrl('redis://redis.example.com:6379')).toBe(false);
  });

  it('fails closed on Redis startup errors only in production', () => {
    expect(shouldFailStartupOnRedisError('production')).toBe(true);
    expect(shouldFailStartupOnRedisError('development')).toBe(false);
    expect(shouldFailStartupOnRedisError('staging')).toBe(false);
  });
});

describe('Dentally environment validation', () => {
  it('allows explicit sandbox write mode only with the sandbox API host', () => {
    expect(getDentallyEnvFatalErrors(dentallyConfig)).toEqual([]);
  });

  it('accepts local simulator base URLs for non-write verification', () => {
    expect(
      getDentallyEnvFatalErrors({
        ...dentallyConfig,
        DENTALLY_ALLOW_SANDBOX_WRITES: false,
        DENTALLY_API_BASE_URL: 'http://localhost:4117',
      }),
    ).toEqual([]);
  });

  it('rejects sandbox writes against production URLs', () => {
    const errors = getDentallyEnvFatalErrors({
      ...dentallyConfig,
      DENTALLY_API_BASE_URL: 'https://api.dentally.co',
    });

    expect(errors).toContain(
      'DENTALLY_ALLOW_SANDBOX_WRITES=true requires Dentally sandbox API base URL',
    );
  });

  it('requires verification and live sandbox mode for sandbox writes', () => {
    const errors = getDentallyEnvFatalErrors({
      ...dentallyConfig,
      DENTALLY_VERIFICATION_ENABLED: false,
      DENTALLY_SANDBOX_MODE: true,
    });

    expect(errors).toContain(
      'DENTALLY_ALLOW_SANDBOX_WRITES=true requires DENTALLY_VERIFICATION_ENABLED=true',
    );
    expect(errors).toContain(
      'DENTALLY_ALLOW_SANDBOX_WRITES=true requires DENTALLY_SANDBOX_MODE=false',
    );
  });

  it('requires explicit controlled-pilot allowlists', () => {
    const errors = getDentallyEnvFatalErrors({
      ...dentallyConfig,
      DENTALLY_ALLOW_SANDBOX_WRITES: false,
      DENTALLY_CONTROLLED_PILOT: true,
    });

    expect(errors).toContain('DENTALLY_CONTROLLED_PILOT=true requires DENTALLY_PILOT_TENANT_IDS');
    expect(errors).toContain(
      'DENTALLY_CONTROLLED_PILOT=true requires DENTALLY_PILOT_INTEGRATION_IDS',
    );
  });
});
