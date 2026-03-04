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

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  disconnected: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function IntegrationsPage() {
  const { data: integrationData, isLoading } = useGetIntegrationsQuery();
  const integrations = integrationData?.data ?? [];

  const [activate, { isLoading: activating }] = useActivateIntegrationMutation();
  const [test, { isLoading: testing }] = useTestIntegrationMutation();
  const [remove] = useDeleteIntegrationMutation();

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
