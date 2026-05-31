import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis as BarXAxis,
  YAxis,
} from 'recharts';
import { ActivityIcon, CheckCircle2Icon, ZapIcon } from 'lucide-react';
import type { PeriodPreset } from './dashboard-utils';

const performanceChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
} satisfies ChartConfig;

interface StatusEntry {
  status: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  statsLoading: boolean;
  hourlyLoading: boolean;
  period: PeriodPreset;
  dailyPerformance: Array<{ label: string; calls: number }>;
  averageLatencyMs: number | null | undefined;
  statusEntries: StatusEntry[];
  statusChartConfig: ChartConfig;
}

export function DashboardChartsRow({
  statsLoading,
  hourlyLoading,
  period,
  dailyPerformance,
  averageLatencyMs,
  statusEntries,
  statusChartConfig,
}: Props) {
  const volumeLabel =
    period === '24h'
      ? 'Hourly'
      : period === '1y'
        ? 'Weekly'
        : period === 'lifetime'
          ? 'Monthly'
          : 'Daily';

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Call Volume */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ActivityIcon className="size-4 text-primary" />
                Call volume
              </CardTitle>
              <CardDescription>{volumeLabel} inbound calls</CardDescription>
            </div>
            {averageLatencyMs != null && (
              <Badge variant="outline" className="gap-1.5 text-xs">
                <ZapIcon className="size-3" />
                {Math.round(averageLatencyMs)}ms avg latency
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {hourlyLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ChartContainer config={performanceChartConfig} className="h-[280px] w-full">
              <AreaChart data={dailyPerformance}>
                <defs>
                  <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <BarXAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 11 }}
                />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  fill="url(#fillCalls)"
                  stroke="var(--color-calls)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Call Outcomes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2Icon className="size-4 text-success-foreground" />
            Call outcomes
          </CardTitle>
          <CardDescription>Status distribution</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
          ) : statusEntries.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No calls yet
            </div>
          ) : (
            <>
              <ChartContainer config={statusChartConfig} className="mx-auto h-[200px] w-full">
                <PieChart>
                  <Pie
                    data={statusEntries}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={50}
                    outerRadius={78}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {statusEntries.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                </PieChart>
              </ChartContainer>
              <div className="mt-3 space-y-1.5">
                {statusEntries.map((entry) => (
                  <div key={entry.status} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-muted-foreground">{entry.label}</span>
                    </div>
                    <span className="font-medium tabular-nums">{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
