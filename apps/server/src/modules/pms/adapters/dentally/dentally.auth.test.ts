import { describe, expect, it } from 'vitest';
import type { Integration } from '../../../integrations/integration.types.js';
import {
  encryptDentallyCredentialsForStorage,
  resolveDentallyAuthContext,
} from './dentally.auth.js';
import { DentallyAuthError, DentallyConfigurationError } from './dentally.errors.js';

function integrationFixture(
  input: {
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
  } = {},
): Integration {
  return {
    id: 'integration-a',
    tenantId: 'tenant-a',
    configVersion: 1,
    integrationType: 'scheduling',
    provider: 'dentally',
    status: 'active',
    config: {
      practiceId: 'practice-a',
      practiceName: 'Practice A',
      ...input.config,
    },
    credentials:
      input.credentials ??
      encryptDentallyCredentialsForStorage({
        accessToken: 'access-token-a',
        refreshToken: 'refresh-token-a',
        accessTokenExpiresAt: '2027-01-01T00:00:00.000Z',
        tokenType: 'Bearer',
        scopes: [
          'appointment:read',
          'appointment:create',
          'appointment:update',
          'patient:read',
          'patient:create',
          'patient:update',
          'practice:read',
          'user:read',
        ],
        practiceId: 'practice-a',
        practiceName: 'Practice A',
        webhookSecret: 'webhook-secret-a',
      }) ??
      {},
    capabilities: {},
    lastSyncAt: null,
    healthStatus: 'healthy',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

describe('Dentally auth hardening', () => {
  it('resolves valid credentials into a bearer auth context', async () => {
    await expect(resolveDentallyAuthContext(integrationFixture())).resolves.toMatchObject({
      baseUrl: 'https://api.dentally.co',
      authorizationHeader: 'Bearer access-token-a',
      integrationId: 'integration-a',
      tenantId: 'tenant-a',
    });
  });

  it('normalizes legacy base URLs that include /v1', async () => {
    await expect(
      resolveDentallyAuthContext(
        integrationFixture({
          config: { baseUrl: 'https://api.sandbox.dentally.co/v1' },
        }),
      ),
    ).resolves.toMatchObject({
      baseUrl: 'https://api.sandbox.dentally.co',
    });
  });

  it('fails closed for expired credentials', async () => {
    const credentials = encryptDentallyCredentialsForStorage({
      accessToken: 'access-token-a',
      refreshToken: 'refresh-token-a',
      accessTokenExpiresAt: '2020-01-01T00:00:00.000Z',
      tokenType: 'Bearer',
      scopes: [
        'appointment:read',
        'appointment:create',
        'appointment:update',
        'patient:read',
        'patient:create',
        'patient:update',
        'practice:read',
        'user:read',
      ],
      practiceId: 'practice-a',
      practiceName: 'Practice A',
    });

    await expect(resolveDentallyAuthContext(integrationFixture({ credentials }))).rejects.toThrow(
      DentallyAuthError,
    );
  });

  it('fails closed when required scopes or practice metadata are missing', async () => {
    const credentials = encryptDentallyCredentialsForStorage({
      accessToken: 'access-token-a',
      refreshToken: 'refresh-token-a',
      accessTokenExpiresAt: '2027-01-01T00:00:00.000Z',
      tokenType: 'Bearer',
      scopes: ['appointment:read', 'patient:read'],
    });

    await expect(
      resolveDentallyAuthContext(
        integrationFixture({
          config: { practiceId: undefined, practiceName: undefined },
          credentials,
        }),
      ),
    ).rejects.toThrow(DentallyAuthError);
  });

  it('validates configured endpoint paths before runtime use', async () => {
    await expect(
      resolveDentallyAuthContext(
        integrationFixture({
          config: { appointmentPath: 'appointments' },
        }),
      ),
    ).rejects.toThrow(DentallyConfigurationError);
  });
});
