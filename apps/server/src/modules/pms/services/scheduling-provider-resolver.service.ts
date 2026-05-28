import { ValidationError } from '../../../lib/errors.js';
import { getActiveGoogleCalendarIntegration } from '../../integrations/integration-registry.js';
import {
  createCsR4PlusSchedulingProvider,
  isCsR4PlusFeatureEnabled,
} from '../adapters/cs-r4-plus/cs-r4-plus.adapter.js';
import { CsR4PlusNotConfiguredError } from '../adapters/cs-r4-plus/cs-r4-plus.errors.js';
import { createDentallySchedulingProvider } from '../adapters/dentally/dentally.adapter.js';
import { isDentallyFeatureEnabled } from '../adapters/dentally/dentally.auth.js';
import { DentallyFeatureDisabledError } from '../adapters/dentally/dentally.errors.js';
import { createGoogleCalendarSchedulingProvider } from '../adapters/google-calendar/google-calendar.adapter.js';
import {
  createSoeExactSchedulingProvider,
  isSoeExactFeatureEnabled,
} from '../adapters/soe-exact/soe-exact.adapter.js';
import { SoeExactNotConfiguredError } from '../adapters/soe-exact/soe-exact.errors.js';
import type { SchedulingProviderKey } from '../domain/appointment.types.js';
import {
  SchedulingProviderFallbackNotAllowedError,
  UnsupportedSchedulingProviderError,
} from '../domain/errors.js';
import type { SchedulingProviderPort } from '../ports/scheduling-provider.port.js';
import { getTenantSchedulingConfig } from './tenant-scheduling-config.service.js';

export type SchedulingProviderOperation = 'read' | 'write';

export interface ResolveActiveSchedulingProviderInput {
  tenantId: string;
  operation?: SchedulingProviderOperation;
  allowFallbackForWrites?: boolean;
}

export interface ActiveSchedulingProviderResolution {
  providerName: SchedulingProviderKey;
  provider: SchedulingProviderPort;
  integrationId: string;
  usedFallback: boolean;
}

export function resolveSchedulingProvider(input: {
  tenantId: string;
  providerName: SchedulingProviderKey;
  integrationId?: string;
}): SchedulingProviderPort {
  if (input.providerName === 'google_calendar') {
    return createGoogleCalendarSchedulingProvider({ tenantId: input.tenantId });
  }

  if (input.providerName === 'dentally') {
    if (!isDentallyFeatureEnabled()) {
      throw new DentallyFeatureDisabledError();
    }
    return createDentallySchedulingProvider({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
    });
  }

  if (input.providerName === 'soe_exact') {
    if (!isSoeExactFeatureEnabled()) {
      throw new SoeExactNotConfiguredError();
    }
    return createSoeExactSchedulingProvider({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
    });
  }

  if (input.providerName === 'cs_r4_plus') {
    if (!isCsR4PlusFeatureEnabled()) {
      throw new CsR4PlusNotConfiguredError();
    }
    return createCsR4PlusSchedulingProvider({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
    });
  }

  throw new UnsupportedSchedulingProviderError(input.providerName);
}

export async function resolveActiveSchedulingProvider(
  input: ResolveActiveSchedulingProviderInput | string,
): Promise<ActiveSchedulingProviderResolution> {
  const normalizedInput =
    typeof input === 'string'
      ? { tenantId: input, operation: 'write' as const }
      : { operation: 'write' as const, ...input };
  const { tenantId } = normalizedInput;
  const config = await getTenantSchedulingConfig(tenantId);

  if (config) {
    try {
      return {
        providerName: config.primaryProvider,
        provider: resolveSchedulingProvider({
          tenantId,
          providerName: config.primaryProvider,
          integrationId: config.primaryIntegrationId,
        }),
        integrationId: config.primaryIntegrationId,
        usedFallback: false,
      };
    } catch (error) {
      if (!(error instanceof UnsupportedSchedulingProviderError) || !config.fallbackProvider) {
        throw error;
      }

      const operation = normalizedInput.operation ?? 'write';
      if (operation === 'write' && !normalizedInput.allowFallbackForWrites) {
        throw new SchedulingProviderFallbackNotAllowedError(config.primaryProvider);
      }

      if (!config.fallbackIntegrationId) {
        throw error;
      }

      return {
        providerName: config.fallbackProvider,
        provider: resolveSchedulingProvider({
          tenantId,
          providerName: config.fallbackProvider,
          integrationId: config.fallbackIntegrationId,
        }),
        integrationId: config.fallbackIntegrationId,
        usedFallback: true,
      };
    }
  }

  const integration = await getActiveGoogleCalendarIntegration(tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  return {
    providerName: 'google_calendar',
    provider: resolveSchedulingProvider({ tenantId, providerName: 'google_calendar' }),
    integrationId: integration.id,
    usedFallback: false,
  };
}
