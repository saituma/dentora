'use client';

import { AlertTriangleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, ProviderCard, PROVIDERS, providerIntegration } from './integration-ui';
import {
  useGetIntegrationsQuery,
  useGetSchedulingConfigQuery,
} from '@/features/integrations/integrationsApi';

export default function IntegrationsPage() {
  const {
    data: integrationData,
    isLoading: integrationsLoading,
    isError: integrationsError,
  } = useGetIntegrationsQuery();
  const {
    data: schedulingData,
    isLoading: schedulingLoading,
    isError: schedulingError,
  } = useGetSchedulingConfigQuery();
  const integrations = integrationData?.data ?? [];
  const schedulingConfig = schedulingData?.data ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling integrations"
        description="Connect and verify scheduling providers for the AI receptionist. Provider status here does not override backend feature flags."
      />

      {integrationsError || schedulingError ? (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Some integration data is unavailable</AlertTitle>
          <AlertDescription>
            Missing backend endpoints are shown as unavailable. No provider is assumed connected.
          </AlertDescription>
        </Alert>
      ) : null}

      {integrationsLoading || schedulingLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <Skeleton key={provider.provider} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((definition) => (
            <ProviderCard
              key={definition.provider}
              definition={definition}
              integration={providerIntegration(integrations, definition.provider)}
              schedulingConfig={schedulingConfig}
            />
          ))}
        </div>
      )}
    </div>
  );
}
