
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  get details(): Record<string, unknown> {
    return this.context;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', context: Record<string, unknown> = {}) {
    super(message, 401, 'AUTHENTICATION_REQUIRED', true, context);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', context: Record<string, unknown> = {}) {
    super(message, 403, 'FORBIDDEN', true, context);
  }
}

export class TenantNotFoundError extends AppError {
  constructor(identifier: string, method: string = 'unknown') {
    super(
      `Tenant not found via ${method}`,
      404,
      'TENANT_NOT_FOUND',
      true,
      { identifier, method },
    );
  }
}

export class TenantSuspendedError extends AppError {
  constructor(tenantId: string) {
    super(
      'Tenant is suspended',
      403,
      'TENANT_SUSPENDED',
      true,
      { tenantId },
    );
  }
}

export class TenantArchivedError extends AppError {
  constructor(tenantId: string) {
    super(
      'Tenant is archived',
      410,
      'TENANT_ARCHIVED',
      true,
      { tenantId },
    );
  }
}

export class ConfigNotFoundError extends AppError {
  constructor(tenantId: string, version?: number) {
    super(
      'Active configuration not found',
      404,
      'CONFIG_NOT_FOUND',
      true,
      { tenantId, version },
    );
  }
}

export class ConfigValidationError extends AppError {
  constructor(tenantId: string, errors: unknown[]) {
    super(
      'Configuration validation failed',
      422,
      'CONFIG_VALIDATION_FAILED',
      true,
      { tenantId, errors },
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errors: unknown[] = []) {
    super(message, 422, 'VALIDATION_ERROR', true, { errors });
  }
}

export class ProviderError extends AppError {
  constructor(message: string, providerName: string, statusCode: number = 502) {
    super(
      message,
      statusCode,
      'PROVIDER_ERROR',
      true,
      { providerName },
    );
  }
}

export class AllProvidersFailedError extends AppError {
  constructor(providerType: string, lastError?: string) {
    super(
      `All ${providerType} providers failed${lastError ? `: ${lastError}` : ''}`,
      503,
      'ALL_PROVIDERS_FAILED',
      false,
      { providerType, lastError },
    );
  }
}

export class TelephonyError extends AppError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 502, 'TELEPHONY_ERROR', true, context);
  }
}

export class PhoneNumberNotMappedError extends AppError {
  constructor(phoneNumber: string) {
    super(
      'Phone number is not mapped to any tenant',
      404,
      'PHONE_NUMBER_NOT_MAPPED',
      true,
      { phoneNumber },
    );
  }
}

export class IntegrationError extends AppError {
  constructor(integrationType: string, provider: string, message: string) {
    super(
      `Integration error: ${message}`,
      502,
      'INTEGRATION_ERROR',
      true,
      { integrationType, provider },
    );
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(
      'Rate limit exceeded',
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      { retryAfterSeconds },
    );
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string = 'unknown') {
    super(
      `${entity} not found`,
      404,
      'NOT_FOUND',
      true,
      { entity, id },
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 409, 'CONFLICT', true, context);
  }
}

export class MissingProviderKeyError extends AppError {
  constructor(provider: string, tenantId: string) {
    super(
      `No API key configured for provider '${provider}'`,
      422,
      'MISSING_PROVIDER_KEY',
      true,
      { provider, tenantId },
    );
  }
}

export class InvalidProviderError extends AppError {
  constructor(provider: string) {
    super(
      `Invalid or unsupported provider: '${provider}'`,
      400,
      'INVALID_PROVIDER',
      true,
      { provider },
    );
  }
}
