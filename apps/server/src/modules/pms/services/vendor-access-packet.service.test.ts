import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../../lib/errors.js';
import { getVendorAccessPacket } from './vendor-access-packet.service.js';

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

describe('vendor access packet service', () => {
  it('builds a SOE/EXACT packet without secrets or patient data', () => {
    const packet = withTenant('tenant-a', () =>
      getVendorAccessPacket({
        tenantId: 'tenant-a',
        provider: 'soe_exact',
        now: new Date('2026-05-28T07:00:00.000Z'),
      }),
    );

    expect(packet).toMatchObject({
      provider: 'soe_exact',
      displayName: 'SOE / EXACT',
      status: 'vendor_access_required',
      subject: 'SOE/EXACT scheduling API and sandbox access request',
      generatedAt: '2026-05-28T07:00:00.000Z',
    });
    expect(packet.emailBody).toContain('API documentation for appointment read');
    expect(packet.emailBody).toContain('We will not use simulator behavior');
    expect(packet.readinessChecklist.map((item) => item.id)).toContain('live_adapter_implemented');
    expect(JSON.stringify(packet)).not.toMatch(
      /plain-secret|Bearer\s+[A-Za-z0-9._-]+|patient Jane/i,
    );
  });

  it('builds a CS R4+ connector-specific packet', () => {
    const packet = withTenant('tenant-a', () =>
      getVendorAccessPacket({
        tenantId: 'tenant-a',
        provider: 'cs_r4_plus',
        now: new Date('2026-05-28T07:00:00.000Z'),
      }),
    );

    expect(packet.subject).toBe('CS R4+ scheduling API, connector, and sandbox access request');
    expect(packet.emailBody).toContain('on-prem connector');
    expect(packet.requiredEvidence).toContain(
      'Confirmation whether an on-prem connector, VPN, client certificate, or regional base URL is required.',
    );
  });

  it('rejects non-vendor-shell providers', () => {
    expect(() =>
      withTenant('tenant-a', () =>
        getVendorAccessPacket({
          tenantId: 'tenant-a',
          provider: 'dentally',
        }),
      ),
    ).toThrow(ValidationError);
  });

  it('enforces tenant isolation before returning packets', () => {
    expect(() =>
      withTenant('tenant-a', () =>
        getVendorAccessPacket({
          tenantId: 'tenant-b',
          provider: 'soe_exact',
        }),
      ),
    ).toThrow(AuthorizationError);
  });
});
