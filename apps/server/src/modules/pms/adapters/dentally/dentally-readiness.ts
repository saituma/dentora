import type { Integration } from '../../../integrations/integration.types.js';
import {
  DENTALLY_REQUIRED_SCOPES,
  dentallyConfigFromIntegration,
  dentallyCredentialsFromIntegration,
  missingDentallyScopes,
  validateDentallyCredentials,
} from './dentally.auth.js';
import type { DentallyClient } from './dentally.client.js';

export type DentallyReadinessStatus = 'pass' | 'fail' | 'pending';

export type DentallyReadinessCheckId =
  | 'api_credentials_present'
  | 'webhook_secret_present'
  | 'required_scopes_present'
  | 'connectivity_healthy'
  | 'auth_passes'
  | 'appointment_create_test'
  | 'appointment_cancel_test'
  | 'patient_lookup_test'
  | 'appointment_reasons_read'
  | 'practitioners_read'
  | 'rooms_read'
  | 'availability_query'
  | 'webhook_delivery_test';

export interface DentallyReadinessCheck {
  id: DentallyReadinessCheckId;
  label: string;
  status: DentallyReadinessStatus;
  detail: string;
}

export interface DentallySandboxEvidence {
  appointmentCreateTestPassed?: boolean;
  appointmentCancelTestPassed?: boolean;
  patientLookupTestPassed?: boolean;
  appointmentReasonsReadPassed?: boolean;
  practitionersReadPassed?: boolean;
  roomsReadPassed?: boolean;
  availabilityQueryPassed?: boolean;
  webhookDeliveryTestPassed?: boolean;
}

export interface DentallyReadinessChecklist {
  provider: 'dentally';
  integrationId: string;
  tenantId: string;
  requiredScopes: readonly string[];
  checks: DentallyReadinessCheck[];
  readinessScore: number;
}

function pass(id: DentallyReadinessCheckId, label: string, detail: string): DentallyReadinessCheck {
  return { id, label, status: 'pass', detail };
}

function fail(id: DentallyReadinessCheckId, label: string, detail: string): DentallyReadinessCheck {
  return { id, label, status: 'fail', detail };
}

function pending(
  id: DentallyReadinessCheckId,
  label: string,
  detail: string,
): DentallyReadinessCheck {
  return { id, label, status: 'pending', detail };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Dentally readiness failure';
}

async function connectivityCheck(
  client: DentallyClient | undefined,
): Promise<DentallyReadinessCheck> {
  if (!client) {
    return pending(
      'connectivity_healthy',
      'Connectivity healthy',
      'No Dentally client was supplied',
    );
  }
  try {
    await client.healthCheck();
    return pass('connectivity_healthy', 'Connectivity healthy', 'Dentally health check passed');
  } catch (error) {
    return fail('connectivity_healthy', 'Connectivity healthy', errorDetail(error));
  }
}

async function authCheck(client: DentallyClient | undefined): Promise<DentallyReadinessCheck> {
  if (!client) {
    return pending('auth_passes', 'Auth passes', 'No Dentally client was supplied');
  }
  try {
    await client.validateCredentials();
    return pass('auth_passes', 'Auth passes', 'Dentally credential validation passed');
  } catch (error) {
    return fail('auth_passes', 'Auth passes', errorDetail(error));
  }
}

function evidenceCheck(input: {
  id: DentallyReadinessCheckId;
  label: string;
  passed?: boolean;
  pendingDetail: string;
}): DentallyReadinessCheck {
  if (input.passed === true) {
    return pass(input.id, input.label, 'Sandbox evidence is recorded as passing');
  }
  if (input.passed === false) {
    return fail(input.id, input.label, 'Sandbox evidence is recorded as failing');
  }
  return pending(input.id, input.label, input.pendingDetail);
}

function score(checks: readonly DentallyReadinessCheck[]): number {
  const passed = checks.filter((check) => check.status === 'pass').length;
  return Math.round((passed / checks.length) * 10);
}

export async function buildDentallySandboxReadinessChecklist(input: {
  integration: Integration;
  client?: DentallyClient;
  evidence?: DentallySandboxEvidence;
}): Promise<DentallyReadinessChecklist> {
  const config = dentallyConfigFromIntegration(input.integration);
  const credentials = dentallyCredentialsFromIntegration(input.integration);
  const checks: DentallyReadinessCheck[] = [];

  try {
    validateDentallyCredentials({ config, credentials });
    checks.push(
      pass(
        'api_credentials_present',
        'API credentials present',
        'Access and refresh tokens are usable',
      ),
    );
  } catch (error) {
    checks.push(fail('api_credentials_present', 'API credentials present', errorDetail(error)));
  }

  checks.push(
    credentials.encryptedWebhookSecret
      ? pass('webhook_secret_present', 'Webhook secret present', 'Webhook secret is configured')
      : fail('webhook_secret_present', 'Webhook secret present', 'Webhook secret is missing'),
  );

  const missingScopes = missingDentallyScopes(credentials.scopes);
  checks.push(
    missingScopes.length === 0
      ? pass(
          'required_scopes_present',
          'Required scopes present',
          'All required Dentally scopes are configured',
        )
      : fail(
          'required_scopes_present',
          'Required scopes present',
          `Missing Dentally scopes: ${missingScopes.join(', ')}`,
        ),
  );

  checks.push(await connectivityCheck(input.client));
  checks.push(await authCheck(input.client));
  checks.push(
    evidenceCheck({
      id: 'appointment_create_test',
      label: 'Appointment create test',
      passed: input.evidence?.appointmentCreateTestPassed,
      pendingDetail: 'Run against Dentally sandbox before production enablement',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'appointment_cancel_test',
      label: 'Appointment cancel test',
      passed: input.evidence?.appointmentCancelTestPassed,
      pendingDetail: 'Run against Dentally sandbox before production enablement',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'patient_lookup_test',
      label: 'Patient lookup test',
      passed: input.evidence?.patientLookupTestPassed,
      pendingDetail: 'Run against Dentally sandbox before production enablement',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'appointment_reasons_read',
      label: 'Appointment reasons read',
      passed: input.evidence?.appointmentReasonsReadPassed,
      pendingDetail: 'Verify GET /v1/appointment_reasons?deleted=false',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'practitioners_read',
      label: 'Practitioners read',
      passed: input.evidence?.practitionersReadPassed,
      pendingDetail: 'Verify GET /v1/practitioners',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'rooms_read',
      label: 'Rooms read',
      passed: input.evidence?.roomsReadPassed,
      pendingDetail: 'Verify GET /v1/rooms',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'availability_query',
      label: 'Availability query',
      passed: input.evidence?.availabilityQueryPassed,
      pendingDetail: 'Verify GET /v1/appointments/availability',
    }),
  );
  checks.push(
    evidenceCheck({
      id: 'webhook_delivery_test',
      label: 'Webhook delivery test',
      passed: input.evidence?.webhookDeliveryTestPassed,
      pendingDetail: 'Run against Dentally sandbox before production enablement',
    }),
  );

  return {
    provider: 'dentally',
    integrationId: input.integration.id,
    tenantId: input.integration.tenantId,
    requiredScopes: DENTALLY_REQUIRED_SCOPES,
    checks,
    readinessScore: score(checks),
  };
}
