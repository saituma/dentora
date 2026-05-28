import { describe, expect, it } from 'vitest';
import {
  evaluateVendorProductionReadiness,
  vendorProductionReadinessChecklistLabels,
} from './vendor-readiness.js';

describe('vendor production readiness evaluator', () => {
  it('keeps SOE/EXACT foundation-only until every production gate is complete', () => {
    const result = evaluateVendorProductionReadiness({
      provider: 'soe_exact',
      readinessChecklist: [
        { id: 'api_docs_available', status: 'approved' },
        { id: 'sandbox_demo_available', status: 'approved' },
        { id: 'appointment_read_supported', status: 'requested' },
      ],
    });

    expect(result.readyForImplementation).toBe(false);
    expect(result.readyForProduction).toBe(false);
    expect(result.score).toBe(14);
    expect(result.missingChecks).toContain('live_adapter_implemented');
  });

  it('separates vendor discovery approval from production enablement', () => {
    const implementationReadyIds = [
      'api_docs_available',
      'sandbox_demo_available',
      'appointment_read_supported',
      'availability_supported',
      'appointment_create_supported',
      'cancel_reschedule_supported',
      'patient_lookup_supported',
      'auth_model_confirmed',
      'data_processing_legal_approved',
    ];

    const result = evaluateVendorProductionReadiness({
      provider: 'cs_r4_plus',
      readinessChecklist: implementationReadyIds.map((id) => ({
        id,
        status: 'approved',
      })),
    });

    expect(result.readyForImplementation).toBe(true);
    expect(result.readyForProduction).toBe(false);
    expect(result.blockers).toContain('Live adapter implemented');
  });

  it('exposes labels for dashboard checklists', () => {
    expect(vendorProductionReadinessChecklistLabels()).toEqual(
      expect.arrayContaining([
        { id: 'live_adapter_implemented', label: 'Live adapter implemented' },
        { id: 'sandbox_contract_tests_passed', label: 'Sandbox contract tests passed' },
      ]),
    );
  });
});
