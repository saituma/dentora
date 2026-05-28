import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CsR4PlusSimulatorSchedulingProvider } from './cs-r4-plus/cs-r4-plus-simulator.js';
import {
  csR4PlusReadinessChecklist,
  defaultCsR4PlusConfig,
} from './cs-r4-plus/cs-r4-plus.config.js';
import { CsR4PlusSchedulingProvider } from './cs-r4-plus/cs-r4-plus.adapter.js';
import { SoeExactSchedulingProvider } from './soe-exact/soe-exact.adapter.js';
import { SoeExactSimulatorSchedulingProvider } from './soe-exact/soe-exact-simulator.js';
import { defaultSoeExactConfig, soeExactReadinessChecklist } from './soe-exact/soe-exact.config.js';

const tenantId = 'tenant-a';
const slot = {
  startIso: '2026-06-01T09:00:00.000Z',
  endIso: '2026-06-01T09:30:00.000Z',
};
const patient = {
  fullName: 'Jane Secret',
  phoneNumber: '+15551234567',
  reasonForVisit: 'Exam',
  dateOfBirth: '1985-01-02',
};

async function exerciseSimulator(
  provider: SoeExactSimulatorSchedulingProvider | CsR4PlusSimulatorSchedulingProvider,
) {
  const created = await provider.createAppointment({
    tenantId,
    timezone: 'UTC',
    appAppointmentId: 'local-appointment-a',
    slot,
    summary: 'Dental appointment - Jane Secret',
    patient,
  });

  await provider.rescheduleAppointment(created.id, {
    tenantId,
    timezone: 'UTC',
    appAppointmentId: 'local-appointment-a',
    slot: {
      startIso: '2026-06-02T10:00:00.000Z',
      endIso: '2026-06-02T10:30:00.000Z',
    },
  });
  await provider.cancelAppointment(created.id);

  return await provider.listAppointments({ tenantId });
}

describe('SOE/EXACT and CS R4+ foundations', () => {
  it('keeps vendor config models unconfirmed by default', () => {
    expect(defaultSoeExactConfig).toMatchObject({
      authType: 'unknown',
      connectorMode: 'unknown',
      pollingMode: 'unknown',
      webhookMode: 'unknown',
      vendorContactStatus: 'not_started',
    });
    expect(defaultCsR4PlusConfig).toMatchObject({
      authType: 'unknown',
      connectorMode: 'unknown',
      pollingMode: 'unknown',
      webhookMode: 'unknown',
      vendorContactStatus: 'not_started',
    });
  });

  it('includes the required vendor readiness questions', () => {
    const requiredIds = [
      'api_docs_available',
      'sandbox_demo_available',
      'appointment_read_supported',
      'availability_supported',
      'appointment_create_supported',
      'cancel_reschedule_supported',
      'patient_lookup_supported',
      'webhooks_or_polling_supported',
      'on_prem_connector_required',
      'auth_model_confirmed',
      'data_processing_legal_approved',
    ];

    expect(soeExactReadinessChecklist.map((check) => check.id)).toEqual(requiredIds);
    expect(csR4PlusReadinessChecklist.map((check) => check.id)).toEqual(requiredIds);
    expect(soeExactReadinessChecklist.every((check) => check.status === 'unknown')).toBe(true);
    expect(csR4PlusReadinessChecklist.every((check) => check.status === 'unknown')).toBe(true);
  });

  it('shell adapters fail closed with typed vendor-access and unsupported-operation errors', async () => {
    process.env.ENABLE_SOE_EXACT = 'true';
    process.env.ENABLE_CS_R4_PLUS = 'true';
    const soe = new SoeExactSchedulingProvider({ tenantId, integrationId: 'soe-a' });
    const r4 = new CsR4PlusSchedulingProvider({ tenantId, integrationId: 'r4-a' });

    await expect(soe.healthCheck()).rejects.toMatchObject({
      name: 'VendorAccessRequiredError',
      provider: 'soe_exact',
    });
    await expect(r4.healthCheck()).rejects.toMatchObject({
      name: 'VendorAccessRequiredError',
      provider: 'cs_r4_plus',
    });
    await expect(soe.upsertPatient({ tenantId, patient })).rejects.toMatchObject({
      name: 'UnsupportedProviderOperationError',
      provider: 'soe_exact',
      operation: 'patient upsert',
    });
    await expect(r4.upsertPatient({ tenantId, patient })).rejects.toMatchObject({
      name: 'UnsupportedProviderOperationError',
      provider: 'cs_r4_plus',
      operation: 'patient upsert',
    });
    delete process.env.ENABLE_SOE_EXACT;
    delete process.env.ENABLE_CS_R4_PLUS;
  });

  it('SOE/EXACT simulator can run local booking, cancel, and reschedule flows', async () => {
    const result = await exerciseSimulator(new SoeExactSimulatorSchedulingProvider({ tenantId }));

    expect(result.appointments).toEqual([
      expect.objectContaining({
        provider: 'soe_exact',
        status: 'cancelled',
        startIso: '2026-06-02T10:00:00.000Z',
      }),
    ]);
  });

  it('CS R4+ simulator can run local booking, cancel, and reschedule flows', async () => {
    const result = await exerciseSimulator(new CsR4PlusSimulatorSchedulingProvider({ tenantId }));

    expect(result.appointments).toEqual([
      expect.objectContaining({
        provider: 'cs_r4_plus',
        status: 'cancelled',
        startIso: '2026-06-02T10:00:00.000Z',
      }),
    ]);
  });

  it('contains no production API call implementation in SOE/R4 shells', async () => {
    const files = await Promise.all([
      readFile('src/modules/pms/adapters/soe-exact/soe-exact.adapter.ts', 'utf8'),
      readFile('src/modules/pms/adapters/cs-r4-plus/cs-r4-plus.adapter.ts', 'utf8'),
    ]);
    const combined = files.join('\n');

    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/\baxios\b/);
    expect(combined).not.toMatch(/\bhttp\.request\b/);
    expect(combined).not.toMatch(/\bhttps\.request\b/);
  });
});
