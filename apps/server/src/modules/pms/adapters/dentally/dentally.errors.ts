import { IntegrationError, ValidationError } from '../../../../lib/errors.js';
import { SchedulingProviderFeatureDisabledError } from '../../domain/errors.js';

export interface DentallyRequestErrorContext {
  [key: string]: unknown;
  status?: number;
  method?: string;
  url?: string;
  requestId?: string;
  correlationId?: string;
  responseBody?: string;
  retryAfterSeconds?: number;
}

export class DentallyConfigurationError extends ValidationError {
  public constructor(message: string) {
    super(message);
    this.name = 'DentallyConfigurationError';
  }
}

export class DentallyAuthError extends IntegrationError {
  public readonly context: DentallyRequestErrorContext;

  public constructor(message: string, context: DentallyRequestErrorContext = {}) {
    super('scheduling', 'dentally', message);
    this.name = 'DentallyAuthError';
    this.context = context;
  }
}

export class DentallyReadOnlyError extends IntegrationError {
  public constructor(operation: string) {
    super(
      'scheduling',
      'dentally',
      `Dentally integration is read-only — ${operation} is not permitted`,
    );
    this.name = 'DentallyReadOnlyError';
  }
}

export class DentallyApiError extends IntegrationError {
  public readonly status?: number;
  public readonly context: DentallyRequestErrorContext;

  public constructor(message: string, status?: number, context: DentallyRequestErrorContext = {}) {
    super('scheduling', 'dentally', message);
    this.name = 'DentallyApiError';
    this.status = status;
    this.context = context;
  }
}

export class DentallyAuthenticationError extends DentallyAuthError {
  public constructor(message: string, context: DentallyRequestErrorContext = {}) {
    super(message, context);
    this.name = 'DentallyAuthenticationError';
  }
}

export class DentallyRateLimitError extends DentallyApiError {
  public readonly retryAfterSeconds?: number;

  public constructor(message: string, context: DentallyRequestErrorContext = {}) {
    super(message, context.status ?? 429, context);
    this.name = 'DentallyRateLimitError';
    this.retryAfterSeconds = context.retryAfterSeconds;
  }
}

export class DentallyValidationError extends DentallyApiError {
  public constructor(message: string, context: DentallyRequestErrorContext = {}) {
    super(message, context.status ?? 422, context);
    this.name = 'DentallyValidationError';
  }
}

export class DentallyConflictError extends DentallyApiError {
  public constructor(message: string, context: DentallyRequestErrorContext = {}) {
    super(message, context.status ?? 409, context);
    this.name = 'DentallyConflictError';
  }
}

export class DentallyNetworkError extends DentallyApiError {
  public constructor(message: string, context: DentallyRequestErrorContext = {}) {
    super(message, undefined, context);
    this.name = 'DentallyNetworkError';
  }
}

export class DentallyCapabilityUnavailableError extends IntegrationError {
  public readonly capability: string;

  public constructor(
    capability: string,
    message = `Dentally API capability unavailable: ${capability}`,
  ) {
    super('scheduling', 'dentally', message);
    this.name = 'DentallyCapabilityUnavailableError';
    this.capability = capability;
  }
}

export class DentallyFeatureDisabledError extends SchedulingProviderFeatureDisabledError {
  public constructor() {
    super('dentally');
    this.name = 'DentallyFeatureDisabledError';
  }
}

export class DentallyWebhookSignatureError extends ValidationError {
  public constructor(message = 'Invalid Dentally webhook signature') {
    super(message);
    this.name = 'DentallyWebhookSignatureError';
  }
}
