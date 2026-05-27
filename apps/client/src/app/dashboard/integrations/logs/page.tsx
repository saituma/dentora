'use client';

import { useMemo, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogsFilters, LogsTable, PageHeader } from '../integration-ui';
import { useGetIntegrationLogsQuery } from '@/features/integrations/integrationsApi';
import type { IntegrationLogFilters, SchedulingProvider } from '@/features/integrations/types';

const initialFilters = {
  provider: 'all',
  status: '',
  eventType: '',
  dateFrom: '',
  dateTo: '',
};

function providerFilter(value: string): SchedulingProvider | 'all' {
  return value === 'google_calendar' ||
    value === 'dentally' ||
    value === 'soe_exact' ||
    value === 'cs_r4_plus'
    ? value
    : 'all';
}

export default function IntegrationLogsPage() {
  const [filters, setFilters] = useState(initialFilters);
  const queryFilters: IntegrationLogFilters = useMemo(
    () => ({
      provider: providerFilter(filters.provider),
      status: filters.status || undefined,
      eventType: filters.eventType || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    }),
    [filters],
  );
  const { data, isLoading, isError } = useGetIntegrationLogsQuery(queryFilters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integration logs"
        description="Review provider events, verification attempts, webhook activity, and failures."
      />
      <LogsFilters values={filters} onChange={setFilters} />
      {isError ? (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Logs endpoint unavailable</AlertTitle>
          <AlertDescription>
            The UI is wired for logs, but the backend endpoint is not returning events yet.
          </AlertDescription>
        </Alert>
      ) : null}
      <LogsTable events={data?.data ?? []} loading={isLoading} />
    </div>
  );
}
