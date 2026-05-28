import { assertTenantAccess } from '../../../db/tenant-context.js';
import { ValidationError } from '../../../lib/errors.js';
import type { SchedulingProviderKey } from '../domain/appointment.types.js';
import {
  isVendorShellProvider,
  vendorProductionReadinessChecklistLabels,
} from '../adapters/vendor-readiness.js';
import type { ReadinessChecklistItem, VendorAccessPacket } from '../pms-dashboard.types.js';
import { PROVIDER_DISPLAY_NAMES } from './pms-provider-overview.service.js';

const REQUIRED_EVIDENCE = [
  'Official API documentation for appointment, availability, patient, and webhook or polling workflows.',
  'Sandbox or demo tenant with permission to create, reschedule, and cancel test appointments.',
  'Auth model and credential rotation process.',
  'Rate limits, retry guidance, idempotency rules, and audit-header requirements.',
  'Data-processing agreement, subprocessor terms, security review path, and support escalation process.',
  'Confirmation whether an on-prem connector, VPN, client certificate, or regional base URL is required.',
] as const;

const ACCEPTANCE_GATE = [
  'Vendor docs are stored in the project knowledge base or linked from a tracked internal ticket.',
  'Sandbox credentials are available in the secret manager, not source control.',
  'Legal/DPA/security approval is recorded.',
  'A provider-specific implementation plan lists real endpoints, auth, idempotency, error mapping, and PHI constraints.',
  'Focused tests prove fail-closed behavior, credential validation, sandbox read/write verification, and tenant isolation.',
] as const;

interface ProviderRequestTemplate {
  subject: string;
  intro: string;
  needs: readonly string[];
  closing: string;
}

const REQUEST_TEMPLATES: Record<VendorAccessPacket['provider'], ProviderRequestTemplate> = {
  soe_exact: {
    subject: 'SOE/EXACT scheduling API and sandbox access request',
    intro:
      'We are integrating Dentora, an AI receptionist and scheduling workflow, with SOE/EXACT for a dental practice. Please provide the official integration path for appointment scheduling.',
    needs: [
      'API documentation for appointment read, availability, create, cancel, and reschedule.',
      'Patient lookup rules and supported identifiers.',
      'Sandbox or demo tenant access for automated verification.',
      'Auth requirements, scopes, credential rotation, and rate limits.',
      'Webhook support for appointment and patient changes, or the supported polling model.',
      'Confirmation whether an on-prem connector, VPN, client certificate, or regional deployment is required.',
      'Data-processing/legal/security review requirements before production use.',
      'Production certification and incident escalation process.',
    ],
    closing:
      'We will not use simulator behavior as production evidence. Please confirm the supported path and any partner program requirements.',
  },
  cs_r4_plus: {
    subject: 'CS R4+ scheduling API, connector, and sandbox access request',
    intro:
      'We are integrating Dentora, an AI receptionist and scheduling workflow, with CS R4+ for a dental practice. Please provide the official integration path for appointment scheduling.',
    needs: [
      'API or connector documentation for appointment read, availability, create, cancel, and reschedule.',
      'Patient lookup rules and supported identifiers.',
      'Sandbox or demo tenant access for automated verification.',
      'Auth requirements, scopes, credential rotation, and rate limits.',
      'Webhook support for appointment and patient changes, or the supported polling model.',
      'Confirmation whether CS R4+ requires an on-prem connector, VPN, client certificate, or regional base URL.',
      'Data-processing/legal/security review requirements before production use.',
      'Production certification and incident escalation process.',
    ],
    closing:
      'We will not use simulator behavior as production evidence. Please confirm the supported path and any partner program requirements.',
  },
};

function buildEmailBody(template: ProviderRequestTemplate): string {
  return [
    'Hello,',
    '',
    template.intro,
    '',
    'We need:',
    '',
    ...template.needs.map((item) => `- ${item}`),
    '',
    template.closing,
  ].join('\n');
}

function readinessChecklist(): ReadinessChecklistItem[] {
  return vendorProductionReadinessChecklistLabels().map((item) => ({
    id: item.id,
    label: item.label,
    status: 'unknown',
  }));
}

export function getVendorAccessPacket(input: {
  tenantId: string;
  provider: SchedulingProviderKey;
  now?: Date;
}): VendorAccessPacket {
  assertTenantAccess(input.tenantId);
  if (!isVendorShellProvider(input.provider)) {
    throw new ValidationError('Vendor access packet is only available for SOE/EXACT and CS R4+');
  }

  const template = REQUEST_TEMPLATES[input.provider];
  return {
    provider: input.provider,
    displayName: PROVIDER_DISPLAY_NAMES[input.provider],
    status: 'vendor_access_required',
    subject: template.subject,
    emailBody: buildEmailBody(template),
    requiredEvidence: [...REQUIRED_EVIDENCE],
    acceptanceGate: [...ACCEPTANCE_GATE],
    readinessChecklist: readinessChecklist(),
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}
