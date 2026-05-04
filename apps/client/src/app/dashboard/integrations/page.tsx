'use client';

import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PlugIcon, Loader2Icon, TrashIcon, ZapIcon, PlayIcon } from 'lucide-react';
import {
  useGetIntegrationsQuery,
  useActivateIntegrationMutation,
  useTestIntegrationMutation,
  useDeleteIntegrationMutation,
} from '@/features/integrations/integrationsApi';
import type { Integration } from '@/features/integrations/types';
import {
  useGetTelephonyNumbersQuery,
  useGetTwilioIncomingNumbersQuery,
  useGetTelephonyWebhookBaseQuery,
  useAssignTelephonyNumberMutation,
  useReleaseTelephonyNumberMutation,
} from '@/features/telephony/telephonyApi';
import { API_BASE_URL } from '@/lib/api';

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  disconnected: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function IntegrationsPage() {
  const { data: integrationData, isLoading } = useGetIntegrationsQuery();
  const integrations = integrationData?.data ?? [];
  const { data: telephonyData, isLoading: telephonyLoading } = useGetTelephonyNumbersQuery();
  const telephonyNumbers = telephonyData?.data ?? [];
  const { data: webhookBaseData } = useGetTelephonyWebhookBaseQuery();
  const {
    data: twilioIncomingData,
    isLoading: twilioIncomingLoading,
    error: twilioIncomingError,
  } = useGetTwilioIncomingNumbersQuery();
  const twilioIncomingNumbers = twilioIncomingData?.data ?? [];

  const [activate, { isLoading: activating }] = useActivateIntegrationMutation();
  const [test, { isLoading: testing }] = useTestIntegrationMutation();
  const [remove] = useDeleteIntegrationMutation();
  const [assignNumber, { isLoading: assigningNumber }] = useAssignTelephonyNumberMutation();
  const [releaseNumber, { isLoading: releasingNumber }] = useReleaseTelephonyNumberMutation();

  const webhookBase = webhookBaseData?.baseUrl?.replace(/\/+$/, '') || '';
  const apiRoot = webhookBase
    ? (webhookBase.endsWith('/api') ? webhookBase : `${webhookBase}/api`)
    : API_BASE_URL;
  const apiRootNormalized = apiRoot.replace(/\/+$/, '');

  const hasAssignedNumber = telephonyNumbers.length > 0;

  const handleActivate = async (id: string) => {
    try {
      await activate(id).unwrap();
      toast.success('Integration activated');
    } catch {
      toast.error('Failed to activate integration');
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await test(id).unwrap();
      if (result.success) {
        toast.success(result.message || 'Connection test passed');
      } else {
        toast.error(result.message || 'Connection test failed');
      }
    } catch {
      toast.error('Test failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id).unwrap();
      toast.success('Integration removed');
    } catch {
      toast.error('Failed to remove integration');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Manage connected services and integrations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telephony (Twilio)</CardTitle>
          <CardDescription>
            {hasAssignedNumber
              ? 'Your clinic phone number for the AI receptionist.'
              : 'Assign a Twilio number to enable the AI receptionist for phone calls.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {telephonyLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : hasAssignedNumber ? (
            <div className="space-y-3">
              {telephonyNumbers.map((number) => (
                <div key={number.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">{number.phoneNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {number.friendlyName ?? 'Clinic line'}
                      {number.status === 'active' ? ' · Active' : ''}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await releaseNumber(number.id).unwrap();
                        toast.success('Twilio number removed');
                      } catch {
                        toast.error('Failed to remove Twilio number');
                      }
                    }}
                    disabled={releasingNumber}
                  >
                    <TrashIcon className="mr-1 size-3" />
                    Remove
                  </Button>
                </div>
              ))}
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Voice webhook: {apiRootNormalized}/telephony/webhook/voice</div>
                <div>Status webhook: {apiRootNormalized}/telephony/webhook/status</div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-sm font-medium">Available numbers</div>
                {twilioIncomingLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : twilioIncomingError ? (
                  <div className="text-sm text-muted-foreground">
                    Unable to load Twilio numbers. Check that Twilio credentials are configured.
                  </div>
                ) : twilioIncomingNumbers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No available Twilio numbers found.</div>
                ) : (
                  <div className="space-y-2">
                    {twilioIncomingNumbers.map((number) => (
                      <div
                        key={number.sid}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                      >
                        <div className="text-sm font-medium">{number.phoneNumber}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={assigningNumber}
                          onClick={async () => {
                            try {
                              await assignNumber({
                                phoneNumber: number.phoneNumber ?? '',
                                twilioSid: number.sid ?? '',
                                friendlyName: number.friendlyName ?? undefined,
                              }).unwrap();
                              toast.success('Phone number assigned');
                            } catch {
                              toast.error('Failed to assign phone number');
                            }
                          }}
                        >
                          {assigningNumber ? <Loader2Icon className="mr-1 size-3 animate-spin" /> : null}
                          Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <EmptyState
          icon={PlugIcon}
          title="No integrations"
          description="Connect your PMS, calendar, or phone system to get started"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onActivate={handleActivate}
              onTest={handleTest}
              onDelete={handleDelete}
              activating={activating}
              testing={testing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  google_calendar: 'Google Calendar',
  google: 'Google',
  twilio: 'Twilio',
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI',
  stripe: 'Stripe',
};

const INTEGRATION_TYPE_LABELS: Record<string, string> = {
  calendar: 'Calendar',
  telephony: 'Phone System',
  payment: 'Payments',
  ai: 'AI Provider',
  sms: 'SMS',
};

function IntegrationCard({
  integration,
  onActivate,
  onTest,
  onDelete,
  activating,
  testing,
}: {
  integration: Integration;
  onActivate: (id: string) => void;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
  activating: boolean;
  testing: boolean;
}) {
  const providerLabel = PROVIDER_LABELS[integration.provider] ?? integration.provider.replace(/_/g, ' ');
  const typeLabel = INTEGRATION_TYPE_LABELS[integration.integrationType] ?? integration.integrationType.replace(/_/g, ' ');

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{providerLabel}</CardTitle>
          <CardDescription className="capitalize">{typeLabel}</CardDescription>
        </div>
        <Badge variant="secondary" className={statusColors[integration.status] ?? ''}>
          {integration.status === 'active' ? 'Connected' : integration.status}
        </Badge>
      </CardHeader>
      <CardContent>
        {integration.healthStatus && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={integration.healthStatus === 'healthy' ? 'text-green-600 dark:text-green-400' : ''}>
              {integration.healthStatus === 'healthy' ? 'Healthy' : integration.healthStatus}
            </span>
            {integration.lastCheckedAt && (
              <span>· Last checked {new Date(integration.lastCheckedAt).toLocaleString()}</span>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          {!integration.isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onActivate(integration.id)}
              disabled={activating}
            >
              {activating ? <Loader2Icon className="mr-1 size-3 animate-spin" /> : <ZapIcon className="mr-1 size-3" />}
              Activate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTest(integration.id)}
            disabled={testing}
          >
            {testing ? <Loader2Icon className="mr-1 size-3 animate-spin" /> : <PlayIcon className="mr-1 size-3" />}
            Test
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(integration.id)}
          >
            <TrashIcon className="mr-1 size-3" />
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
