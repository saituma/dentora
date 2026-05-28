import { describe, expect, it } from 'vitest';
import type { Integration } from '../../../integrations/integration.types.js';
import { encryptDentallyCredentialsForStorage } from './dentally.auth.js';
import { buildDentallySandboxReadinessChecklist } from './dentally-readiness.js';

function integrationFixture(): Integration {
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
    },
    credentials:
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
      }) ?? {},
    capabilities: {},
    lastSyncAt: null,
    healthStatus: 'healthy',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

describe('Dentally readiness checklist', () => {
  it('includes documented read and availability checks', async () => {
    const checklist = await buildDentallySandboxReadinessChecklist({
      integration: integrationFixture(),
      evidence: {
        appointmentReasonsReadPassed: true,
        practitionersReadPassed: true,
        roomsReadPassed: true,
        availabilityQueryPassed: true,
      },
    });

    expect(checklist.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'appointment_reasons_read', status: 'pass' }),
        expect.objectContaining({ id: 'practitioners_read', status: 'pass' }),
        expect.objectContaining({ id: 'rooms_read', status: 'pass' }),
        expect.objectContaining({ id: 'availability_query', status: 'pass' }),
      ]),
    );
  });
});
