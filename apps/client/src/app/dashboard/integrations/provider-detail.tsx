'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangleIcon,
  ClipboardCopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  SaveIcon,
  ServerIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DentallyVerificationPanel,
  DetailShell,
  PROVIDERS,
  VENDOR_CHECKLIST,
  providerBySlug,
  providerIntegration,
  statusLabel,
} from './integration-ui';
import {
  useGetDentallyVerificationReportQuery,
  useGetIntegrationsQuery,
  useGetProviderDetailQuery,
  useGetVendorAccessPacketQuery,
  useGetSchedulingConfigQuery,
  useConfigureProviderMutation,
  useRunDentallyVerificationMutation,
  useCreateIntegrationMutation,
  useTestIntegrationMutation,
} from '@/features/integrations/integrationsApi';
import type {
  ProviderDetail,
  SchedulingProvider,
  VendorAccessPacket,
  VendorReadinessChecklistItem,
  VendorReadinessStatus,
} from '@/features/integrations/types';

interface ProviderDetailPageProps {
  slug: 'google' | 'dentally' | 'soe-exact' | 'cs-r4-plus';
}

export function ProviderDetailPage({ slug }: ProviderDetailPageProps) {
  const definition = providerBySlug(slug) ?? PROVIDERS[0];
  const { data: integrationData, isError: integrationsError } = useGetIntegrationsQuery();
  const { data: schedulingData } = useGetSchedulingConfigQuery();
  const { data: detail, isError: detailError } = useGetProviderDetailQuery(definition.provider);
  const integration = providerIntegration(integrationData?.data ?? [], definition.provider);

  return (
    <DetailShell
      definition={definition}
      integration={integration}
      schedulingConfig={schedulingData?.data ?? null}
      detail={detail}
      detailError={detailError || integrationsError}
    >
      {definition.provider === 'dentally' ? <DentallyDetail /> : null}
      {definition.provider === 'soe_exact' ? (
        <VendorAccessDetail provider="soe_exact" detail={detail} />
      ) : null}
      {definition.provider === 'cs_r4_plus' ? (
        <VendorAccessDetail provider="cs_r4_plus" detail={detail} />
      ) : null}
      {definition.provider === 'google_calendar' ? <GoogleDetail /> : null}
    </DetailShell>
  );
}

function GoogleDetail() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Calendar runtime</CardTitle>
        <CardDescription>Google Calendar is the current live scheduling adapter.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Manage OAuth connection, calendar selection, and health from the existing integration
        lifecycle. No Google runtime behavior was changed for this UI.
      </CardContent>
    </Card>
  );
}

const DENTALLY_TOKEN_URL = 'https://app.dentally.co/settings/developer/tokens';

function DentallyConnectCard() {
  const { data: integrationData } = useGetIntegrationsQuery();
  const integration = providerIntegration(integrationData?.data ?? [], 'dentally');
  const [practiceName, setPracticeName] = useState('');
  const [token, setToken] = useState('');
  const [createIntegration, { isLoading: isConnecting }] = useCreateIntegrationMutation();
  const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();
  const [testResult, setTestResult] = useState<string | null>(null);

  const connectedName =
    typeof integration?.config?.practiceName === 'string'
      ? integration.config.practiceName
      : 'your practice';
  const isReadOnly = integration?.config?.readOnly === true;

  async function handleConnect() {
    if (!practiceName.trim() || !token.trim()) {
      toast.error('Enter your practice name and Dentally token');
      return;
    }
    try {
      await createIntegration({
        integrationType: 'scheduling',
        provider: 'dentally',
        config: {
          readOnly: true,
          baseUrl: 'https://api.dentally.co',
          practiceName: practiceName.trim(),
        },
        credentials: {
          accessToken: token.trim(),
          tokenType: 'Bearer',
          scopes: ['patient:read', 'appointment:read'],
          practiceName: practiceName.trim(),
        },
      }).unwrap();
      setToken('');
      toast.success('Dentally connected (read-only)');
    } catch {
      toast.error('Could not connect Dentally — check the token and try again');
    }
  }

  async function handleTest() {
    if (!integration) return;
    setTestResult(null);
    try {
      const result = await testIntegration(integration.id).unwrap();
      setTestResult(result.message);
      toast.success('Dentally connection verified');
    } catch {
      setTestResult('Connection test failed — the token may be invalid or lack read access.');
      toast.error('Dentally connection test failed');
    }
  }

  if (integration) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dentally connection</CardTitle>
          <CardDescription>
            Connected to {connectedName}
            {isReadOnly ? ' · read-only (view diary & patients)' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleTest} disabled={isTesting} variant="outline">
            {isTesting ? <Loader2Icon className="animate-spin" /> : <ServerIcon />}
            Test connection
          </Button>
          {testResult ? <p className="text-sm text-muted-foreground">{testResult}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect your Dentally account</CardTitle>
        <CardDescription>
          Read-only access lets the AI see your live diary and patients — it can never change
          anything in Dentally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1.</span> Open your Dentally token page
            (button below) — log in if asked.
          </li>
          <li>
            <span className="font-medium text-foreground">2.</span> Click{' '}
            <span className="font-medium text-foreground">Generate new token</span>, tick{' '}
            <span className="font-medium text-foreground">patient:read</span> and{' '}
            <span className="font-medium text-foreground">appointment:read</span>, then copy it.
          </li>
          <li>
            <span className="font-medium text-foreground">3.</span> Paste it below with your
            practice name and connect.
          </li>
        </ol>
        <Button
          variant="outline"
          onClick={() => window.open(DENTALLY_TOKEN_URL, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLinkIcon />
          Open Dentally token page
        </Button>
        <div className="space-y-1">
          <label htmlFor="dentally-practice" className="text-xs text-muted-foreground">
            Practice name
          </label>
          <Input
            id="dentally-practice"
            value={practiceName}
            onChange={(event) => setPracticeName(event.target.value)}
            placeholder="e.g. Bright Smile Dental"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="dentally-token" className="text-xs text-muted-foreground">
            Read-only API token
          </label>
          <Input
            id="dentally-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste your Dentally token"
            autoComplete="off"
          />
        </div>
        <Button onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? <Loader2Icon className="animate-spin" /> : null}
          Connect Dentally
        </Button>
      </CardContent>
    </Card>
  );
}

function DentallyDetail() {
  const [runningType, setRunningType] = useState<string | undefined>();
  const [runVerification] = useRunDentallyVerificationMutation();
  const { data: reportData, refetch } = useGetDentallyVerificationReportQuery();
  const report = reportData?.data;

  const flags = useMemo(
    () => [
      ['ENABLE_DENTALLY', 'Backend controlled'],
      ['Sandbox mode', 'Required until real sandbox verification passes'],
      ['Verification status', report?.productionRecommendation ?? 'Not available'],
    ],
    [report?.productionRecommendation],
  );

  async function handleRun(type: string) {
    setRunningType(type);
    try {
      await runVerification({ type }).unwrap();
      toast.success('Dentally verification completed');
      await refetch();
    } catch {
      toast.error('Dentally verification did not complete');
    } finally {
      setRunningType(undefined);
    }
  }

  async function handleReport() {
    setRunningType('report');
    try {
      await refetch();
      toast.success('Dentally report refreshed');
    } catch {
      toast.error('Dentally report is unavailable');
    } finally {
      setRunningType(undefined);
    }
  }

  return (
    <div className="space-y-4">
      <DentallyConnectCard />
      <Alert variant="warning">
        <AlertTriangleIcon />
        <AlertTitle>Booking into Dentally needs partner approval</AlertTitle>
        <AlertDescription>
          A read-only connection lets the AI view the live diary and patients now. Creating or
          cancelling appointments in Dentally stays disabled until partner verification passes.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dentally controls</CardTitle>
          <CardDescription>
            Runtime flags are displayed as backend-controlled state.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {flags.map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-sm font-medium">{value}</div>
            </div>
          ))}
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Readiness score</div>
            <div className="text-sm font-medium">
              {report ? `${report.readinessScore}/10` : 'Unavailable'}
            </div>
          </div>
        </CardContent>
      </Card>
      <DentallyVerificationPanel
        runningType={runningType}
        report={report}
        onRun={handleRun}
        onReport={handleReport}
      />
    </div>
  );
}

function VendorAccessDetail({
  provider,
  detail,
}: {
  provider: Extract<SchedulingProvider, 'soe_exact' | 'cs_r4_plus'>;
  detail?: ProviderDetail;
}) {
  const title = provider === 'soe_exact' ? 'SOE / EXACT' : 'CS R4+';
  const fallbackChecklist = detail?.readinessChecklist ?? VENDOR_CHECKLIST;
  const {
    data: packetData,
    isFetching: packetFetching,
    isError: packetError,
    refetch: refetchPacket,
  } = useGetVendorAccessPacketQuery(provider);
  const packet = packetData?.data;

  async function handleCopyEmail() {
    if (!packet) {
      toast.error('Vendor access packet is unavailable');
      return;
    }
    try {
      await copyToClipboard(`${packet.subject}\n\n${packet.emailBody}`);
      toast.success('Vendor email copied');
    } catch {
      toast.error('Could not copy vendor email');
    }
  }

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <AlertTriangleIcon />
        <AlertTitle>Vendor access required</AlertTitle>
        <AlertDescription>
          {title} is not production enabled. The current adapter is a fail-closed foundation and
          simulator only.
        </AlertDescription>
      </Alert>
      {provider === 'cs_r4_plus' ? (
        <Alert variant="warning">
          <ServerIcon />
          <AlertTitle>On-prem connector not confirmed</AlertTitle>
          <AlertDescription>
            CS R4+ may require an on-prem connector. Do not plan live deployment until the vendor
            confirms the integration path.
          </AlertDescription>
        </Alert>
      ) : null}
      <EditableVendorChecklist provider={provider} items={fallbackChecklist} />
      <VendorAccessPacketCard
        packet={packet}
        loading={packetFetching}
        error={packetError}
        onRetry={() => void refetchPacket()}
        onCopyEmail={handleCopyEmail}
      />
    </div>
  );
}

const VENDOR_READINESS_STATUSES: VendorReadinessStatus[] = [
  'unknown',
  'requested',
  'available',
  'blocked',
  'approved',
];

function EditableVendorChecklist({
  provider,
  items,
}: {
  provider: Extract<SchedulingProvider, 'soe_exact' | 'cs_r4_plus'>;
  items: VendorReadinessChecklistItem[];
}) {
  const [draftItems, setDraftItems] = useState(items);
  const [configureProvider, { isLoading }] = useConfigureProviderMutation();
  const readiness = useMemo(() => readinessSummary(draftItems), [draftItems]);

  useEffect(() => {
    setDraftItems(items);
  }, [items]);

  function updateItem(
    id: string,
    patch: Partial<Pick<VendorReadinessChecklistItem, 'status' | 'note' | 'evidenceUrl'>>,
  ) {
    setDraftItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function handleSave() {
    try {
      await configureProvider({
        provider,
        body: {
          readinessChecklist: draftItems.map(({ id, status, note, evidenceUrl }) => ({
            id,
            status,
            note: note?.trim() || undefined,
            evidenceUrl: evidenceUrl?.trim() || undefined,
          })),
        },
      }).unwrap();
      toast.success('Vendor readiness saved');
    } catch {
      toast.error('Vendor readiness could not be saved');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Required vendor information</CardTitle>
            <CardDescription>
              Record vendor evidence before any production implementation work.
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <Loader2Icon className="mr-1 size-3.5 animate-spin" />
            ) : (
              <SaveIcon className="mr-1 size-3.5" />
            )}
            Save readiness
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Implementation readiness</div>
              <div className="text-xs text-muted-foreground">
                {readiness.approved} of {readiness.total} checks approved
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{readiness.percent}%</Badge>
              {readiness.blocked > 0 ? (
                <Badge variant="warning">{readiness.blocked} blocked</Badge>
              ) : null}
            </div>
          </div>
          <Progress value={readiness.percent} aria-label="Vendor implementation readiness">
            <ProgressTrack>
              <ProgressIndicator style={{ width: `${readiness.percent}%` }} />
            </ProgressTrack>
          </Progress>
        </div>
        {draftItems.map((item) => (
          <div key={item.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_180px]">
            <div className="min-w-0 space-y-2">
              <div className="text-sm font-medium">{item.label}</div>
              <Textarea
                size="sm"
                value={item.note ?? ''}
                placeholder="Evidence note"
                onChange={(event) => updateItem(item.id, { note: event.target.value })}
              />
              <Input
                nativeInput
                type="url"
                value={item.evidenceUrl ?? ''}
                placeholder="Evidence link"
                onChange={(event) => updateItem(item.id, { evidenceUrl: event.target.value })}
              />
            </div>
            <Select
              value={item.status}
              onValueChange={(value) =>
                updateItem(item.id, { status: value as VendorReadinessStatus })
              }
              items={VENDOR_READINESS_STATUSES.map((status) => ({
                label: statusLabel(status),
                value: status,
              }))}
            >
              <SelectTrigger aria-label={`${item.label} status`}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_READINESS_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function readinessSummary(items: VendorReadinessChecklistItem[]): {
  approved: number;
  blocked: number;
  total: number;
  percent: number;
} {
  const total = Math.max(1, items.length);
  const approved = items.filter((item) => item.status === 'approved').length;
  const blocked = items.filter((item) => item.status === 'blocked').length;
  return {
    approved,
    blocked,
    total: items.length,
    percent: Math.round((approved / total) * 100),
  };
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('Clipboard copy failed');
}

function VendorAccessPacketCard({
  packet,
  loading,
  error,
  onRetry,
  onCopyEmail,
}: {
  packet?: VendorAccessPacket;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  onCopyEmail: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Vendor access packet</CardTitle>
            <CardDescription>
              Use this packet to request official docs, sandbox access, and approval evidence.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCopyEmail} disabled={!packet || loading}>
            {loading ? (
              <Loader2Icon className="mr-1 size-3.5 animate-spin" />
            ) : (
              <ClipboardCopyIcon className="mr-1 size-3.5" />
            )}
            Copy email
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertTitle>Packet unavailable</AlertTitle>
            <AlertDescription>
              The backend packet endpoint did not respond. No vendor-ready state is assumed.
            </AlertDescription>
          </Alert>
        ) : null}
        {packet ? (
          <>
            <div className="rounded-md border p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <MailIcon className="size-4" />
                {packet.subject}
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {packet.emailBody}
              </pre>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <PacketList title="Required evidence" items={packet.requiredEvidence} />
              <PacketList title="Acceptance gate" items={packet.acceptanceGate} />
            </div>
          </>
        ) : (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            {loading ? 'Loading vendor access packet...' : 'Vendor access packet is not loaded.'}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onRetry} disabled={loading}>
            <FileTextIcon className="mr-1 size-3.5" />
            Refresh packet
          </Button>
          <Button variant="outline" disabled>
            View simulator status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PacketList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
