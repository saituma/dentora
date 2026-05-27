import type { SchedulingProviderKey } from './appointment.types.js';

export class SchedulingProviderError extends Error {
  public readonly provider: SchedulingProviderKey;

  public constructor(provider: SchedulingProviderKey, message: string) {
    super(message);
    this.name = 'SchedulingProviderError';
    this.provider = provider;
  }
}

export class SchedulingProviderTenantMismatchError extends SchedulingProviderError {
  public constructor(provider: SchedulingProviderKey) {
    super(provider, 'Scheduling provider tenant mismatch');
    this.name = 'SchedulingProviderTenantMismatchError';
  }
}

export class UnsupportedSchedulingProviderError extends SchedulingProviderError {
  public constructor(provider: SchedulingProviderKey) {
    super(provider, `Scheduling provider ${provider} is not implemented yet`);
    this.name = 'UnsupportedSchedulingProviderError';
  }
}

export class SchedulingProviderFallbackNotAllowedError extends SchedulingProviderError {
  public constructor(provider: SchedulingProviderKey) {
    super(provider, 'Scheduling provider fallback is not allowed for this operation');
    this.name = 'SchedulingProviderFallbackNotAllowedError';
  }
}

export class SchedulingProviderFeatureDisabledError extends SchedulingProviderError {
  public constructor(provider: SchedulingProviderKey) {
    super(provider, `Scheduling provider ${provider} is disabled`);
    this.name = 'SchedulingProviderFeatureDisabledError';
  }
}

export class SchedulingProviderCapabilityUnavailableError extends SchedulingProviderError {
  public readonly capability: string;

  public constructor(provider: SchedulingProviderKey, capability: string) {
    super(provider, `Scheduling provider ${provider} does not support ${capability}`);
    this.name = 'SchedulingProviderCapabilityUnavailableError';
    this.capability = capability;
  }
}

export class VendorAccessRequiredError extends SchedulingProviderError {
  public readonly requirement: string;

  public constructor(provider: SchedulingProviderKey, requirement: string) {
    super(provider, `Vendor access is required before ${provider} can be used: ${requirement}`);
    this.name = 'VendorAccessRequiredError';
    this.requirement = requirement;
  }
}

export class UnsupportedProviderOperationError extends SchedulingProviderError {
  public readonly operation: string;

  public constructor(provider: SchedulingProviderKey, operation: string) {
    super(provider, `Scheduling provider ${provider} does not support operation: ${operation}`);
    this.name = 'UnsupportedProviderOperationError';
    this.operation = operation;
  }
}
