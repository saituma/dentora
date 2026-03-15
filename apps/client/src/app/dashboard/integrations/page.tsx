'use client';

import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
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

  const [phoneNumber, setPhoneNumber] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [friendlyName, setFriendlyName] = useState('');

  const webhookBase = webhookBaseData?.baseUrl?.replace(/\/+$/, '') || '';
  const apiRoot = webhookBase
    ? (webhookBase.endsWith('/api') ? webhookBase : `${webhookBase}/api`)
    : API_BASE_URL;
  const apiRootNormalized = apiRoot.replace(/\/+$/, '');

  useEffect(() => {
    if (!phoneNumber.trim() && !twilioSid.trim() && twilioIncomingNumbers.length > 0) {
      const primary = twilioIncomingNumbers[0];
      setPhoneNumber(primary.phoneNumber ?? '');
      setTwilioSid(primary.sid ?? '');
      setFriendlyName(primary.friendlyName ?? '');
    }
  }, [phoneNumber, twilioSid, twilioIncomingNumbers]);

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

  const handleAssignNumber = async () => {
    try {
      await assignNumber({
        phoneNumber: phoneNumber.trim(),
        twilioSid: twilioSid.trim(),
        friendlyName: friendlyName.trim() || undefined,
      }).unwrap();
      setPhoneNumber('');
      setTwilioSid('');
      setFriendlyName('');
      toast.success('Twilio number saved');
    } catch {
      toast.error('Failed to save Twilio number');
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
            Assign the dedicated Twilio number for this clinic and configure webhook URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Detected Twilio numbers</div>
            {twilioIncomingLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : twilioIncomingError ? (
              <div className="text-sm text-muted-foreground">
                Unable to load Twilio numbers. Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set.
              </div>
            ) : twilioIncomingNumbers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No Twilio numbers found.</div>
            ) : (
              <div className="space-y-2">
                {twilioIncomingNumbers.map((number) => (
                  <div
                    key={number.sid}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{number.phoneNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        SID: {number.sid}
                        {number.friendlyName ? ` • ${number.friendlyName}` : ''}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPhoneNumber(number.phoneNumber ?? '');
                        setTwilioSid(number.sid ?? '');
                        setFriendlyName(number.friendlyName ?? '');
                      }}
                    >
                      Use this number
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Phone number (E.164)"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
            <Input
              placeholder="Twilio number SID"
              value={twilioSid}
              onChange={(event) => setTwilioSid(event.target.value)}
            />
            <Input
              placeholder="Friendly name (optional)"
              value={friendlyName}
              onChange={(event) => setFriendlyName(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleAssignNumber}
              disabled={!phoneNumber.trim() || !twilioSid.trim() || assigningNumber}
            >
              {assigningNumber ? <Loader2Icon className="mr-1 size-3 animate-spin" /> : null}
              Save Twilio number
            </Button>
            <span className="text-xs text-muted-foreground">
              Voice webhook: {apiRootNormalized}/telephony/webhook/voice
            </span>
            <span className="text-xs text-muted-foreground">
              Status webhook: {apiRootNormalized}/telephony/webhook/status
            </span>
          </div>
          {telephonyLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : telephonyNumbers.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No Twilio numbers saved yet.
            </div>
          ) : (
            <div className="space-y-2">
              {telephonyNumbers.map((number) => (
                <div key={number.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">{number.phoneNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      SID: {number.twilioSid}{number.friendlyName ? ` • ${number.friendlyName}` : ''}
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
            </div>
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
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{integration.provider}</CardTitle>
          <CardDescription className="capitalize">
            {integration.integrationType.replace(/_/g, ' ')}
          </CardDescription>
        </div>
        <Badge variant="secondary" className={statusColors[integration.status] ?? ''}>
          {integration.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {integration.healthStatus && (
            <span className="text-xs text-muted-foreground">
              Health: {integration.healthStatus}
            </span>
          )}
          {integration.lastCheckedAt && (
            <span className="text-xs text-muted-foreground">
              · Checked {new Date(integration.lastCheckedAt).toLocaleString()}
            </span>
          )}
        </div>
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
