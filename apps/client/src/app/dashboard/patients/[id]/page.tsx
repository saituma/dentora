'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGetPatientByIdQuery, useGetPatientCallsQuery } from '@/features/patients/patientsApi';
import { formatDate, formatDateTime } from '../patient-utils';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts';

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  escalated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  started: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function formatStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params?.id;

  const { data: patientData, isLoading: patientLoading } = useGetPatientByIdQuery(patientId ?? '', {
    skip: !patientId,
  });
  const { data: callsData, isLoading: callsLoading } = useGetPatientCallsQuery(
    { patientId: patientId ?? '', limit: 100 },
    { skip: !patientId },
  );

  const patient = patientData?.data ?? null;
  const calls = callsData?.data ?? [];

  const statusCounts = calls.reduce((acc, call) => {
    const key = call.status ?? 'unknown';
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  const statusChartData = Array.from(statusCounts.entries()).map(([status, count]) => ({
    status,
    count,
  }));

  const statusChartConfig = statusChartData.reduce((acc, entry, index) => {
    const colorVar = `hsl(var(--chart-${(index % 5) + 1}))`;
    acc[entry.status] = { label: formatStatusLabel(entry.status), color: colorVar };
    return acc;
  }, {} as ChartConfig);

  const monthlyCounts = calls.reduce((acc, call) => {
    if (!call.startedAt) return acc;
    const date = new Date(call.startedAt);
    if (Number.isNaN(date.getTime())) return acc;
    const label = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    acc.set(label, (acc.get(label) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  const monthlyChartData = Array.from(monthlyCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => {
      const aDate = new Date(a.month);
      const bDate = new Date(b.month);
      return aDate.getTime() - bDate.getTime();
    });

  const monthlyChartConfig = {
    count: { label: 'Calls', color: 'hsl(var(--chart-3))' },
  } satisfies ChartConfig;

  const lastCall = calls[0];

  if (!patientId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Patient not found.</p>
        <Link href="/dashboard/patients" className="text-sm text-muted-foreground hover:text-foreground">
          Back to patients
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/dashboard/patients" className="text-sm text-muted-foreground hover:text-foreground">
          Back to patients
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Patient details</h2>
          <p className="text-sm text-muted-foreground">
            {patientLoading ? 'Loading patient…' : `${patient?.fullName ?? 'Unknown'} · ${patient ? patient.phoneNumber : ''}`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader />
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Full name</p>
              <p className="text-sm text-muted-foreground">{patient?.fullName ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Phone number</p>
              <p className="text-sm text-muted-foreground">{patient?.phoneNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Date of birth</p>
              <p className="text-sm text-muted-foreground">{formatDate(patient?.dateOfBirth ?? null)}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Last visit</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(patient?.lastVisitAt ?? null)}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Profile created</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(patient?.createdAt ?? null)}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Last updated</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(patient?.updatedAt ?? null)}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium">Notes</p>
              <p className="text-sm text-muted-foreground">{patient?.notes || 'No notes recorded.'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Total calls</p>
              <p className="text-sm text-muted-foreground">{calls.length}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Last call</p>
              <p className="text-sm text-muted-foreground">
                {lastCall ? `${formatDateTime(lastCall.startedAt)} · ${formatStatusLabel(lastCall.status)}` : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-sm font-medium">Call status breakdown</p>
              {statusChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls recorded.</p>
              ) : (
                <ChartContainer config={statusChartConfig} className="h-[220px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                    <Pie data={statusChartData} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} />
                    <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                  </PieChart>
                </ChartContainer>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <p className="mb-2 text-sm font-medium">Calls by month</p>
              {monthlyChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No call activity yet.</p>
              ) : (
                <ChartContainer config={monthlyChartConfig} className="h-[220px] w-full">
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Call history</p>
            {callsLoading ? (
              <p className="text-sm text-muted-foreground">Loading calls…</p>
            ) : calls.length === 0 ? (
              <p className="text-sm text-muted-foreground">No calls recorded for this patient.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls.map((call) => (
                      <TableRow key={call.id}>
                        <TableCell>{formatDateTime(call.startedAt)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusColors[call.status] ?? ''}>
                            {formatStatusLabel(call.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {call.transcriptSummary || call.intentDetected || 'No summary available.'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/dashboard/calls/${call.id}`}
                            className="text-sm text-muted-foreground hover:text-foreground"
                          >
                            View call
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
