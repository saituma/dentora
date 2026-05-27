'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangleIcon, FileTextIcon, ServerIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DentallyVerificationPanel,
  DetailShell,
  PROVIDERS,
  VendorChecklist,
  VENDOR_CHECKLIST,
  providerBySlug,
  providerIntegration,
} from './integration-ui';
import {
  useGetDentallyVerificationReportQuery,
  useGetIntegrationsQuery,
  useGetProviderDetailQuery,
  useGetSchedulingConfigQuery,
  useRunDentallyVerificationMutation,
} from '@/features/integrations/integrationsApi';
import type { SchedulingProvider } from '@/features/integrations/types';

interface ProviderDetailPageProps {
  slug: 'google' | 'dentally' | 'soe-exact' | 'cs-r4-plus';
}

export function ProviderDetailPage({ slug }: ProviderDetailPageProps) {
  const definition = providerBySlug(slug) ?? PROVIDERS[0];
  const { data: integrationData, isError: integrationsError } = useGetIntegrationsQuery();
  const { data: schedulingData } = useGetSchedulingConfigQuery();
  const { isError: detailError } = useGetProviderDetailQuery(definition.provider);
  const integration = providerIntegration(integrationData?.data ?? [], definition.provider);

  return (
    <DetailShell
      definition={definition}
      integration={integration}
      schedulingConfig={schedulingData?.data ?? null}
      detailError={detailError || integrationsError}
    >
      {definition.provider === 'dentally' ? <DentallyDetail /> : null}
      {definition.provider === 'soe_exact' ? <VendorAccessDetail provider="soe_exact" /> : null}
      {definition.provider === 'cs_r4_plus' ? <VendorAccessDetail provider="cs_r4_plus" /> : null}
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
      <Alert variant="warning">
        <AlertTriangleIcon />
        <AlertTitle>Dentally is not production ready</AlertTitle>
        <AlertDescription>
          Do not enable Dentally for live clinics unless the real sandbox has passed verification
          and controlled pilot readiness is explicitly approved.
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
}: {
  provider: Extract<SchedulingProvider, 'soe_exact' | 'cs_r4_plus'>;
}) {
  const title = provider === 'soe_exact' ? 'SOE / EXACT' : 'CS R4+';
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
      <VendorChecklist items={VENDOR_CHECKLIST} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor actions</CardTitle>
          <CardDescription>
            Track access work without implying production readiness.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline">
            <FileTextIcon className="mr-1 size-3.5" />
            Mark docs requested
          </Button>
          <Button variant="outline" disabled>
            Upload/vendor notes placeholder
          </Button>
          <Button variant="outline" disabled>
            View simulator status
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
