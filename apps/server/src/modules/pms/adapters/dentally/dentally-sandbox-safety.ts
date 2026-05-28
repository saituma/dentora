import { env } from '../../../../config/env.js';
import type { DentallyConfig } from './dentally.types.js';
import { DentallyConfigurationError } from './dentally.errors.js';

export type DentallySandboxSafetyErrorCode =
  | 'dentally_sandbox_mode_enabled'
  | 'dentally_sandbox_writes_disabled'
  | 'dentally_verification_disabled'
  | 'dentally_feature_disabled'
  | 'dentally_production_url_blocked'
  | 'dentally_unknown_host_blocked'
  | 'dentally_invalid_base_url'
  | 'dentally_pilot_tenant_not_allowed'
  | 'dentally_pilot_integration_not_allowed'
  | 'dentally_pilot_allowlist_missing';

export class DentallySandboxSafetyError extends DentallyConfigurationError {
  public readonly code: DentallySandboxSafetyErrorCode;

  public constructor(message: string, code: DentallySandboxSafetyErrorCode) {
    super(message);
    this.name = 'DentallySandboxSafetyError';
    this.code = code;
  }
}

export interface DentallySafetyEnv {
  enableDentally: boolean;
  verificationEnabled: boolean;
  sandboxMode: boolean;
  allowSandboxWrites: boolean;
  controlledPilot: boolean;
  approvedTenantIds: readonly string[];
  approvedIntegrationIds: readonly string[];
}

export interface DentallySandboxSafetyContext {
  tenantId: string;
  integrationId: string;
  config: DentallyConfig;
}

export interface DentallyWriteSafetyInput extends DentallySandboxSafetyContext {
  executeVendorWrite?: boolean;
}

export interface DentallyWriteSafetyResult {
  mode: 'dry_run' | 'live_vendor_write';
  sandboxHost: string;
  controlledPilot: boolean;
  safetyReason?: string;
}

const DENTALLY_SANDBOX_HOSTNAME = 'api.sandbox.dentally.co';
const DENTALLY_PRODUCTION_HOSTNAMES = new Set([
  'api.dentally.co',
  'api.apac.dentally.com',
  'api.ca.dentally.com',
]);

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function csvFromEnv(name: string, fallback: string): string[] {
  const value = process.env[name] ?? fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function dentallySafetyEnv(): DentallySafetyEnv {
  return {
    enableDentally: boolFromEnv('ENABLE_DENTALLY', env.ENABLE_DENTALLY),
    verificationEnabled: boolFromEnv(
      'DENTALLY_VERIFICATION_ENABLED',
      env.DENTALLY_VERIFICATION_ENABLED,
    ),
    sandboxMode: boolFromEnv('DENTALLY_SANDBOX_MODE', env.DENTALLY_SANDBOX_MODE),
    allowSandboxWrites: boolFromEnv(
      'DENTALLY_ALLOW_SANDBOX_WRITES',
      env.DENTALLY_ALLOW_SANDBOX_WRITES,
    ),
    controlledPilot: boolFromEnv('DENTALLY_CONTROLLED_PILOT', env.DENTALLY_CONTROLLED_PILOT),
    approvedTenantIds: csvFromEnv('DENTALLY_PILOT_TENANT_IDS', env.DENTALLY_PILOT_TENANT_IDS),
    approvedIntegrationIds: csvFromEnv(
      'DENTALLY_PILOT_INTEGRATION_IDS',
      env.DENTALLY_PILOT_INTEGRATION_IDS,
    ),
  };
}

export function isDentallyControlledPilotMode(): boolean {
  return dentallySafetyEnv().controlledPilot;
}

export function validateDentallySandboxHostname(baseUrl: string): string {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    throw new DentallySandboxSafetyError(
      'Dentally base URL is invalid',
      'dentally_invalid_base_url',
    );
  }

  if (hostname === DENTALLY_SANDBOX_HOSTNAME) {
    return hostname;
  }
  if (DENTALLY_PRODUCTION_HOSTNAMES.has(hostname)) {
    throw new DentallySandboxSafetyError(
      'Dentally verification blocked production API hostname',
      'dentally_production_url_blocked',
    );
  }
  throw new DentallySandboxSafetyError(
    'Dentally verification blocked unknown API hostname',
    'dentally_unknown_host_blocked',
  );
}

export function validateDentallySafetyEnv(
  envConfig: DentallySafetyEnv = dentallySafetyEnv(),
): void {
  if (envConfig.allowSandboxWrites) {
    if (!envConfig.enableDentally) {
      throw new DentallySandboxSafetyError(
        'Dentally sandbox writes require ENABLE_DENTALLY=true',
        'dentally_feature_disabled',
      );
    }
    if (!envConfig.verificationEnabled) {
      throw new DentallySandboxSafetyError(
        'Dentally sandbox writes require DENTALLY_VERIFICATION_ENABLED=true',
        'dentally_verification_disabled',
      );
    }
    if (envConfig.sandboxMode) {
      throw new DentallySandboxSafetyError(
        'Dentally sandbox writes require DENTALLY_SANDBOX_MODE=false',
        'dentally_sandbox_mode_enabled',
      );
    }
  }

  if (envConfig.controlledPilot) {
    if (envConfig.approvedTenantIds.length === 0 || envConfig.approvedIntegrationIds.length === 0) {
      throw new DentallySandboxSafetyError(
        'Dentally controlled pilot requires tenant and integration allowlists',
        'dentally_pilot_allowlist_missing',
      );
    }
  }
}

export function validateDentallyPilotAllowlist(input: {
  tenantId: string;
  integrationId: string;
  safetyEnv?: DentallySafetyEnv;
}): void {
  const safetyEnv = input.safetyEnv ?? dentallySafetyEnv();
  if (!safetyEnv.controlledPilot) return;
  if (!safetyEnv.approvedTenantIds.includes(input.tenantId)) {
    throw new DentallySandboxSafetyError(
      'Tenant is not approved for Dentally controlled pilot',
      'dentally_pilot_tenant_not_allowed',
    );
  }
  if (!safetyEnv.approvedIntegrationIds.includes(input.integrationId)) {
    throw new DentallySandboxSafetyError(
      'Integration is not approved for Dentally controlled pilot',
      'dentally_pilot_integration_not_allowed',
    );
  }
}

export function validateDentallyVerificationSafety(
  input: DentallySandboxSafetyContext,
): Omit<DentallyWriteSafetyResult, 'mode' | 'safetyReason'> {
  const safetyEnv = dentallySafetyEnv();
  validateDentallySafetyEnv(safetyEnv);
  const sandboxHost = validateDentallySandboxHostname(input.config.baseUrl);
  validateDentallyPilotAllowlist({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    safetyEnv,
  });
  return {
    sandboxHost,
    controlledPilot: safetyEnv.controlledPilot,
  };
}

export function validateDentallyWriteSafety(
  input: DentallyWriteSafetyInput,
): DentallyWriteSafetyResult {
  const readSafety = validateDentallyVerificationSafety(input);
  if (!input.executeVendorWrite) {
    return {
      ...readSafety,
      mode: 'dry_run',
      safetyReason: 'request_did_not_opt_in',
    };
  }

  const safetyEnv = dentallySafetyEnv();
  if (safetyEnv.sandboxMode) {
    throw new DentallySandboxSafetyError(
      'Dentally vendor write blocked because sandbox mode is enabled',
      'dentally_sandbox_mode_enabled',
    );
  }
  if (!safetyEnv.allowSandboxWrites) {
    throw new DentallySandboxSafetyError(
      'Dentally vendor write blocked because sandbox writes are disabled',
      'dentally_sandbox_writes_disabled',
    );
  }
  if (!safetyEnv.verificationEnabled) {
    throw new DentallySandboxSafetyError(
      'Dentally vendor write blocked because verification mode is disabled',
      'dentally_verification_disabled',
    );
  }

  return {
    ...readSafety,
    mode: 'live_vendor_write',
  };
}
