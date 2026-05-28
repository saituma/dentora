import type { SchedulingProviderKey } from '../domain/appointment.types.js';

export type VendorShellProvider = Extract<SchedulingProviderKey, 'soe_exact' | 'cs_r4_plus'>;

export type VendorReadinessInputStatus =
  | 'unknown'
  | 'requested'
  | 'available'
  | 'blocked'
  | 'approved';

export interface VendorReadinessInputItem {
  id: string;
  status: VendorReadinessInputStatus;
  note?: string;
  evidenceUrl?: string;
}

export interface VendorProductionReadiness {
  provider: VendorShellProvider;
  score: number;
  readyForImplementation: boolean;
  readyForProduction: false;
  blockers: string[];
  approvedChecks: string[];
  missingChecks: string[];
}

export const VENDOR_FOUNDATION_PROVIDERS: readonly VendorShellProvider[] = [
  'soe_exact',
  'cs_r4_plus',
] as const;

export const VENDOR_PRODUCTION_READINESS_CHECKS = [
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
  'live_adapter_implemented',
  'sandbox_contract_tests_passed',
  'pilot_runbook_approved',
] as const;

export type VendorProductionReadinessCheckId = (typeof VENDOR_PRODUCTION_READINESS_CHECKS)[number];

const IMPLEMENTATION_READY_CHECKS = new Set<VendorProductionReadinessCheckId>([
  'api_docs_available',
  'sandbox_demo_available',
  'appointment_read_supported',
  'availability_supported',
  'appointment_create_supported',
  'cancel_reschedule_supported',
  'patient_lookup_supported',
  'auth_model_confirmed',
  'data_processing_legal_approved',
]);

const CHECK_LABELS: Record<VendorProductionReadinessCheckId, string> = {
  api_docs_available: 'Official API docs approved',
  sandbox_demo_available: 'Sandbox or demo tenant approved',
  appointment_read_supported: 'Appointment read support approved',
  availability_supported: 'Availability support approved',
  appointment_create_supported: 'Appointment create support approved',
  cancel_reschedule_supported: 'Cancel and reschedule support approved',
  patient_lookup_supported: 'Patient lookup support approved',
  webhooks_or_polling_supported: 'Webhook or polling support approved',
  on_prem_connector_required: 'Connector requirements approved',
  auth_model_confirmed: 'Auth model approved',
  data_processing_legal_approved: 'Legal and data processing approved',
  live_adapter_implemented: 'Live adapter implemented',
  sandbox_contract_tests_passed: 'Sandbox contract tests passed',
  pilot_runbook_approved: 'Pilot runbook approved',
};

export function isVendorShellProvider(
  provider: SchedulingProviderKey,
): provider is VendorShellProvider {
  return VENDOR_FOUNDATION_PROVIDERS.includes(provider as VendorShellProvider);
}

function statusById(
  items: readonly VendorReadinessInputItem[],
): Map<string, VendorReadinessInputStatus> {
  return new Map(items.map((item) => [item.id, item.status]));
}

export function vendorProductionReadinessChecklistLabels(): Array<{
  id: VendorProductionReadinessCheckId;
  label: string;
}> {
  return VENDOR_PRODUCTION_READINESS_CHECKS.map((id) => ({
    id,
    label: CHECK_LABELS[id],
  }));
}

export function evaluateVendorProductionReadiness(input: {
  provider: VendorShellProvider;
  readinessChecklist?: readonly VendorReadinessInputItem[];
}): VendorProductionReadiness {
  const statuses = statusById(input.readinessChecklist ?? []);
  const approvedChecks = VENDOR_PRODUCTION_READINESS_CHECKS.filter(
    (id) => statuses.get(id) === 'approved',
  );
  const missingChecks = VENDOR_PRODUCTION_READINESS_CHECKS.filter(
    (id) => statuses.get(id) !== 'approved',
  );
  const implementationMissing = [...IMPLEMENTATION_READY_CHECKS].filter(
    (id) => statuses.get(id) !== 'approved',
  );
  const score = Math.round(
    (approvedChecks.length / VENDOR_PRODUCTION_READINESS_CHECKS.length) * 100,
  );
  const blockers =
    missingChecks.length === 0
      ? ['Production adapter is still foundation-only until enabled by code review.']
      : missingChecks.map((id) => CHECK_LABELS[id]);

  return {
    provider: input.provider,
    score,
    readyForImplementation: implementationMissing.length === 0,
    readyForProduction: false,
    blockers,
    approvedChecks,
    missingChecks,
  };
}
