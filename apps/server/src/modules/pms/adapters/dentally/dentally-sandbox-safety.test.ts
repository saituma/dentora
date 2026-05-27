import { beforeEach, describe, expect, it } from 'vitest';
import type { DentallyConfig } from './dentally.types.js';
import {
  DentallySandboxSafetyError,
  validateDentallySandboxHostname,
  validateDentallyVerificationSafety,
  validateDentallyWriteSafety,
} from './dentally-sandbox-safety.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const integrationId = '22222222-2222-4222-8222-222222222222';

function config(baseUrl = 'https://api.sandbox.dentally.co'): DentallyConfig {
  return {
    baseUrl,
    appointmentPath: '/appointments',
    patientPath: '/patients',
    clinicianPath: '/practitioners',
    roomPath: '/rooms',
    webhookPath: '/webhooks',
    authPath: '/user',
    signatureHeader: 'x-dentally-signature',
    timestampHeader: 'x-dentally-timestamp',
    replayWindowSeconds: 300,
    timeoutMs: 15000,
    maxRetries: 2,
    practiceId: 'practice-a',
    practiceName: 'Practice A',
  };
}

beforeEach(() => {
  process.env.ENABLE_DENTALLY = 'true';
  process.env.DENTALLY_VERIFICATION_ENABLED = 'false';
  process.env.DENTALLY_SANDBOX_MODE = 'true';
  process.env.DENTALLY_ALLOW_SANDBOX_WRITES = 'false';
  process.env.DENTALLY_CONTROLLED_PILOT = 'false';
  delete process.env.DENTALLY_PILOT_TENANT_IDS;
  delete process.env.DENTALLY_PILOT_INTEGRATION_IDS;
});

describe('Dentally sandbox safety', () => {
  it('accepts only the official Dentally sandbox hostname', () => {
    expect(validateDentallySandboxHostname('https://api.sandbox.dentally.co/v1')).toBe(
      'api.sandbox.dentally.co',
    );
  });

  it('rejects production Dentally API hosts', () => {
    expect(() => validateDentallySandboxHostname('https://api.dentally.co/v1')).toThrow(
      DentallySandboxSafetyError,
    );
    try {
      validateDentallySandboxHostname('https://api.dentally.co/v1');
    } catch (error) {
      expect(error).toBeInstanceOf(DentallySandboxSafetyError);
      expect((error as DentallySandboxSafetyError).code).toBe('dentally_production_url_blocked');
    }
  });

  it('rejects unknown API hosts', () => {
    try {
      validateDentallySandboxHostname('https://example.invalid/v1');
    } catch (error) {
      expect(error).toBeInstanceOf(DentallySandboxSafetyError);
      expect((error as DentallySandboxSafetyError).code).toBe('dentally_unknown_host_blocked');
    }
  });

  it('keeps writes in dry-run mode when the request does not opt in', () => {
    const safety = validateDentallyWriteSafety({
      tenantId,
      integrationId,
      config: config(),
      executeVendorWrite: false,
    });

    expect(safety).toMatchObject({
      mode: 'dry_run',
      safetyReason: 'request_did_not_opt_in',
      sandboxHost: 'api.sandbox.dentally.co',
    });
  });

  it('blocks explicit writes unless live sandbox write env is complete', () => {
    expect(() =>
      validateDentallyWriteSafety({
        tenantId,
        integrationId,
        config: config(),
        executeVendorWrite: true,
      }),
    ).toThrow(DentallySandboxSafetyError);
  });

  it('allows explicit writes only in live sandbox write mode', () => {
    process.env.DENTALLY_VERIFICATION_ENABLED = 'true';
    process.env.DENTALLY_SANDBOX_MODE = 'false';
    process.env.DENTALLY_ALLOW_SANDBOX_WRITES = 'true';

    const safety = validateDentallyWriteSafety({
      tenantId,
      integrationId,
      config: config(),
      executeVendorWrite: true,
    });

    expect(safety).toMatchObject({
      mode: 'live_vendor_write',
      sandboxHost: 'api.sandbox.dentally.co',
    });
  });

  it('requires explicit pilot tenant and integration allowlists', () => {
    process.env.DENTALLY_CONTROLLED_PILOT = 'true';
    process.env.DENTALLY_PILOT_TENANT_IDS = tenantId;
    process.env.DENTALLY_PILOT_INTEGRATION_IDS = '33333333-3333-4333-8333-333333333333';

    expect(() =>
      validateDentallyVerificationSafety({
        tenantId,
        integrationId,
        config: config(),
      }),
    ).toThrow(DentallySandboxSafetyError);
  });
});
