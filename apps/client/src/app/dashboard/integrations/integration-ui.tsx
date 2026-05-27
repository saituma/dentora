'use client';

import Link from 'next/link';
import type * as React from 'react';
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ExternalLinkIcon,
  FileSearchIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlugIcon,
  RotateCwIcon,
  ShieldAlertIcon,
  UnplugIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import type {
  DentallyVerificationReport,
  Integration,
  IntegrationLogEvent,
  IntegrationStatus,
  SchedulingConfig,
  SchedulingProvider,
  VendorReadinessChecklistItem,
  VerificationStatus,
} from '@/features/integrations/types';

export interface ProviderDefinition {
  provider: SchedulingProvider;
  slug: 'google' | 'dentally' | 'soe-exact' | 'cs-r4-plus';
  name: string;
  description: string;
  warning?: string;
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    provider: 'google_calendar',
    slug: 'google',
    name: 'Google Calendar',
    description: 'Live calendar adapter for scheduling, availability, and booking workflows.',
  },
  {
    provider: 'dentally',
    slug: 'dentally',
    name: 'Dentally',
    description: 'PMS adapter with sandbox verification tooling. Real credentials still required.',
    warning: 'Not production ready until real Dentally sandbox verification passes.',
  },
  {
    provider: 'soe_exact',
    slug: 'soe-exact',
    name: 'SOE / EXACT',
    description: 'Foundation shell only. Vendor API access and legal approval are required.',
    warning: 'Vendor access required. Not production enabled.',
  },
  {
    provider: 'cs_r4_plus',
    slug: 'cs-r4-plus',
    name: 'CS R4+',
    description: 'Foundation shell only. On-prem connector requirements are not confirmed.',
    warning: 'Vendor access required. Not production enabled.',
  },
];

export const VENDOR_CHECKLIST: VendorReadinessChecklistItem[] = [
  { id: 'api_docs', label: 'Official API docs', status: 'unknown' },
  { id: 'sandbox', label: 'Sandbox/demo tenant', status: 'unknown' },
  { id: 'auth_model', label: 'Auth model', status: 'unknown' },
  { id: 'scheduling_endpoints', label: 'Scheduling endpoints', status: 'unknown' },
  { id: 'availability_model', label: 'Availability model', status: 'unknown' },
  {
    id: 'mutation_rules',
    label: 'Appointment create/cancel/reschedule rules',
    status: 'unknown',
  },
  { id: 'patient_lookup', label: 'Patient lookup rules', status: 'unknown' },
  { id: 'webhooks_polling', label: 'Webhook or polling support', status: 'unknown' },
  { id: 'connector', label: 'On-prem connector requirements', status: 'unknown' },
  { id: 'legal', label: 'Legal/DPA/security approval', status: 'unknown' },
];

export const DENTALLY_VERIFICATION_ACTIONS = [
  { type: 'connectivity', label: 'Connectivity' },
  { type: 'credentials', label: 'Credentials' },
  { type: 'scopes', label: 'Scopes' },
  { type: 'patient-lookup', label: 'Patient lookup' },
  { type: 'appointment-read', label: 'Appointment read' },
  { type: 'appointment-create', label: 'Appointment create dry-run' },
  { type: 'appointment-cancel', label: 'Appointment cancel dry-run' },
  { type: 'webhook', label: 'Webhook verification' },
] as const;

const STATUS_LABELS: Record<IntegrationStatus | VerificationStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  verification_required: 'Verification required',
  sandbox_verified: 'Sandbox verified',
  controlled_pilot_ready: 'Controlled pilot ready',
  vendor_access_required: 'Vendor access required',
  disabled: 'Disabled',
  error: 'Error',
  not_started: 'Not started',
  pending: 'Pending',
  pass: 'Pass',
  fail: 'Fail',
  warning: 'Warning',
};

const STATUS_CLASSES: Record<string, string> = {
  connected: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  sandbox_verified:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  controlled_pilot_ready:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  pass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  verification_required: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  vendor_access_required: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  pending: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  disabled: 'border-muted bg-muted text-muted-foreground',
  disconnected: 'border-muted bg-muted text-muted-foreground',
  not_started: 'border-muted bg-muted text-muted-foreground',
  error: 'border-destructive/20 bg-destructive/10 text-destructive',
  fail: 'border-destructive/20 bg-destructive/10 text-destructive',
};

export function statusLabel(status: IntegrationStatus | VerificationStatus | string): string {
  return (
    STATUS_LABELS[status as IntegrationStatus | VerificationStatus] ?? status.replace(/_/g, ' ')
  );
}

export function StatusBadge({
  status,
}: {
  status: IntegrationStatus | VerificationStatus | string;
}) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status] ?? 'border-muted bg-muted'}>
      {statusLabel(status)}
    </Badge>
  );
}

export function providerBySlug(slug: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.slug === slug);
}

export function providerByKey(key: SchedulingProvider): ProviderDefinition {
  return PROVIDERS.find((provider) => provider.provider === key) ?? PROVIDERS[0];
}

export function normalizeIntegrationStatus(
  provider: SchedulingProvider,
  integration?: Integration,
): IntegrationStatus {
  if (provider === 'soe_exact' || provider === 'cs_r4_plus') return 'vendor_access_required';
  if (!integration) return provider === 'dentally' ? 'verification_required' : 'disconnected';
  if (integration.status === 'active' || integration.isActive) return 'connected';
  if (integration.status === 'error') return 'error';
  return 'disconnected';
}

export function providerIntegration(
  integrations: Integration[],
  provider: SchedulingProvider,
): Integration | undefined {
  return integrations.find((integration) => integration.provider === provider);
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ProviderCard({
  definition,
  integration,
  schedulingConfig,
}: {
  definition: ProviderDefinition;
  integration?: Integration;
  schedulingConfig?: SchedulingConfig | null;
}) {
  const status = normalizeIntegrationStatus(definition.provider, integration);
  const sourceOfTruth =
    schedulingConfig?.primaryProvider === definition.provider
      ? schedulingConfig.sourceOfTruth
      : 'not_source';
  const lastHealth = integration?.lastCheckedAt ?? integration?.lastSyncAt ?? null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{definition.name}</CardTitle>
            <CardDescription>{definition.description}</CardDescription>
          </div>
          <StatusBadge status={status} />
        </div>
        {definition.warning ? (
          <Alert variant="warning" className="py-2">
            <AlertTriangleIcon />
            <AlertDescription>{definition.warning}</AlertDescription>
          </Alert>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Metric label="Source of truth" value={sourceOfTruth.replace(/_/g, ' ')} />
          <Metric
            label="Verification"
            value={definition.provider === 'google_calendar' ? 'not required' : statusLabel(status)}
          />
          <Metric
            label="Last health check"
            value={lastHealth ? new Date(lastHealth).toLocaleString('en-GB') : 'Not checked'}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" render={<Link href={`/dashboard/integrations/${definition.slug}`} />}>
            <ExternalLinkIcon className="mr-1 size-3.5" />
            Configure
          </Button>
          <Button variant="outline" size="sm" disabled={status === 'disabled'}>
            <PlugIcon className="mr-1 size-3.5" />
            Connect
          </Button>
          <Button variant="outline" size="sm" disabled={definition.provider === 'google_calendar'}>
            <RotateCwIcon className="mr-1 size-3.5" />
            Run verification
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/dashboard/integrations/logs" />}>
            <FileSearchIcon className="mr-1 size-3.5" />
            View logs
          </Button>
          <Button variant="ghost" size="sm" disabled={!integration}>
            <UnplugIcon className="mr-1 size-3.5" />
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DetailShell({
  definition,
  integration,
  schedulingConfig,
  detailError,
  children,
}: {
  definition: ProviderDefinition;
  integration?: Integration;
  schedulingConfig?: SchedulingConfig | null;
  detailError?: boolean;
  children?: React.ReactNode;
}) {
  const status = normalizeIntegrationStatus(definition.provider, integration);
  return (
    <div className="space-y-6">
      <PageHeader
        title={definition.name}
        description={definition.description}
        action={
          <Button variant="outline" size="sm" render={<Link href="/dashboard/integrations" />}>
            Back to integrations
          </Button>
        }
      />
      {definition.warning ? (
        <Alert variant="warning">
          <ShieldAlertIcon />
          <AlertTitle>Production guardrail</AlertTitle>
          <AlertDescription>{definition.warning}</AlertDescription>
        </Alert>
      ) : null}
      {detailError ? (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Live provider details unavailable</AlertTitle>
          <AlertDescription>
            The UI is wired for this endpoint, but the backend is not returning provider detail yet.
            No successful state is being assumed.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusPanel icon={<PlugIcon />} title="Connection status" value={statusLabel(status)} />
        <StatusPanel
          icon={<KeyRoundIcon />}
          title="Credential status"
          value={integration ? 'Stored' : 'Not connected'}
        />
        <StatusPanel
          icon={<CheckCircle2Icon />}
          title="Provider health"
          value={integration?.healthStatus ?? 'Unknown'}
        />
        <StatusPanel
          icon={<CalendarDaysIcon />}
          title="Last health check"
          value={
            integration?.lastCheckedAt
              ? new Date(integration.lastCheckedAt).toLocaleString('en-GB')
              : 'Not checked'
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">{children}</div>
        <SidePanels
          definition={definition}
          integration={integration}
          schedulingConfig={schedulingConfig}
        />
      </div>
    </div>
  );
}

function SidePanels({
  definition,
  integration,
  schedulingConfig,
}: {
  definition: ProviderDefinition;
  integration?: Integration;
  schedulingConfig?: SchedulingConfig | null;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduling config</CardTitle>
          <CardDescription>Source of truth and fallback routing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Metric
            label="Source of truth"
            value={schedulingConfig?.sourceOfTruth ?? 'Unavailable'}
          />
          <Metric
            label="Primary provider"
            value={
              schedulingConfig?.primaryProvider
                ? providerByKey(schedulingConfig.primaryProvider).name
                : 'Unavailable'
            }
          />
          <Metric
            label="Fallback provider"
            value={
              schedulingConfig?.fallbackProvider
                ? providerByKey(schedulingConfig.fallbackProvider).name
                : 'None configured'
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent events</CardTitle>
          <CardDescription>Sync, webhook, and verification activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ClipboardListIcon}
            title="No events available"
            description="Event logging endpoints are not returning data yet."
            className="p-6"
          />
        </CardContent>
      </Card>
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
          <CardDescription>Disconnecting stops this provider from being used.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled={!integration || definition.provider !== 'google_calendar'}
          >
            <UnplugIcon className="mr-1 size-3.5" />
            Disconnect
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function VendorChecklist({ items }: { items: VendorReadinessChecklistItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Required vendor information</CardTitle>
        <CardDescription>These items must be confirmed before production work.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-md border p-3"
          >
            <span className="text-sm">{item.label}</span>
            <StatusBadge
              status={item.status === 'unknown' ? 'verification_required' : item.status}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DentallyVerificationPanel({
  runningType,
  report,
  onRun,
  onReport,
}: {
  runningType?: string;
  report?: DentallyVerificationReport;
  onRun: (type: string) => void;
  onReport: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dentally verification</CardTitle>
        <CardDescription>
          Run documented sandbox verification checks before any pilot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {DENTALLY_VERIFICATION_ACTIONS.map((action) => (
            <Button
              key={action.type}
              variant="outline"
              className="justify-start"
              onClick={() => onRun(action.type)}
              disabled={Boolean(runningType)}
            >
              {runningType === action.type ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <RotateCwIcon className="mr-2 size-4" />
              )}
              {action.label}
            </Button>
          ))}
        </div>
        <Button onClick={onReport} disabled={Boolean(runningType)}>
          Full report
        </Button>
        <div className="rounded-md border p-3 text-sm">
          <Metric
            label="Readiness score"
            value={report ? `${report.readinessScore}/10` : 'Unavailable'}
          />
          <Metric
            label="Production recommendation"
            value={report?.productionRecommendation ?? 'Not available'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function LogsTable({
  events,
  loading,
}: {
  events: IntegrationLogEvent[];
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (events.length === 0) {
    return (
      <EmptyState
        icon={FileSearchIcon}
        title="No logs"
        description="No integration events match the current filters."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[840px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Provider</th>
            <th className="px-3 py-2 font-medium">Event type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Tenant ID</th>
            <th className="px-3 py-2 font-medium">Correlation ID</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b last:border-0">
              <td className="px-3 py-2">{providerByKey(event.provider).name}</td>
              <td className="px-3 py-2">{event.eventType}</td>
              <td className="px-3 py-2">
                <StatusBadge status={event.status} />
              </td>
              <td className="px-3 py-2 font-mono text-xs">{event.tenantId}</td>
              <td className="px-3 py-2 font-mono text-xs">{event.correlationId ?? 'None'}</td>
              <td className="px-3 py-2">{new Date(event.createdAt).toLocaleString('en-GB')}</td>
              <td className="px-3 py-2">{event.durationMs ?? 'n/a'}</td>
              <td className="px-3 py-2">{event.errorSummary ?? 'None'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LogsFilters({
  values,
  onChange,
}: {
  values: {
    provider: string;
    status: string;
    eventType: string;
    dateFrom: string;
    dateTo: string;
  };
  onChange: (values: {
    provider: string;
    status: string;
    eventType: string;
    dateFrom: string;
    dateTo: string;
  }) => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 md:grid-cols-5">
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={values.provider}
          onChange={(event) => onChange({ ...values, provider: event.target.value })}
          aria-label="Provider filter"
        >
          <option value="all">All providers</option>
          {PROVIDERS.map((provider) => (
            <option key={provider.provider} value={provider.provider}>
              {provider.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Status filter"
          placeholder="Status"
          value={values.status}
          onChange={(event) => onChange({ ...values, status: event.target.value })}
        />
        <Input
          aria-label="Event type filter"
          placeholder="Event type"
          value={values.eventType}
          onChange={(event) => onChange({ ...values, eventType: event.target.value })}
        />
        <Input
          aria-label="Date from filter"
          type="date"
          value={values.dateFrom}
          onChange={(event) => onChange({ ...values, dateFrom: event.target.value })}
        />
        <Input
          aria-label="Date to filter"
          type="date"
          value={values.dateTo}
          onChange={(event) => onChange({ ...values, dateTo: event.target.value })}
        />
      </CardContent>
    </Card>
  );
}

export function StatusPanel({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
        <Metric label={title} value={value} />
      </CardContent>
    </Card>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
