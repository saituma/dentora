'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';

const trendChartConfig = {
  cost: { label: 'Cost ($)', color: 'var(--chart-1)' },
  recovered: { label: 'Revenue Recovered ($)', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const summary = {
  period: { start: 'Mar 1, 2026', end: 'Mar 31, 2026' },
  totalCost: '1248.60',
  totalCalls: 1976,
  recoveredRevenue: '23890.00',
  roiMultiple: '19.1x',
  costBreakdown: {
    voice_minutes: '746.20',
    ai_inference: '312.45',
    telephony: '119.35',
    integrations: '70.60',
  },
};

const limits = {
  withinLimits: true,
  plan: 'growth',
  callsIncluded: 2500,
  minutesIncluded: 9000,
  currentUsage: {
    calls: 1976,
    minutes: 7142,
    cost: '1248.60',
  },
};

const trend = [
  { date: '2026-03-01', cost: 34, recovered: 510 },
  { date: '2026-03-04', cost: 38, recovered: 610 },
  { date: '2026-03-07', cost: 40, recovered: 690 },
  { date: '2026-03-10', cost: 42, recovered: 720 },
  { date: '2026-03-13', cost: 39, recovered: 670 },
  { date: '2026-03-16', cost: 45, recovered: 810 },
  { date: '2026-03-19', cost: 47, recovered: 890 },
  { date: '2026-03-22', cost: 43, recovered: 760 },
  { date: '2026-03-25', cost: 49, recovered: 940 },
  { date: '2026-03-28', cost: 51, recovered: 980 },
  { date: '2026-03-31', cost: 50, recovered: 1010 },
];

export default function BillingPage() {
  const callsUsagePercent = Math.min((limits.currentUsage.calls / limits.callsIncluded) * 100, 100);
  const minutesUsagePercent = Math.min((limits.currentUsage.minutes / limits.minutesIncluded) * 100, 100);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Subscription + usage-based performance snapshot
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total cost</CardTitle>
            <CardDescription>
              {`${summary.period.start} – ${summary.period.end}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${summary.totalCost}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total calls</CardTitle>
            <CardDescription>Calls in period</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalCalls}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue recovered</CardTitle>
            <CardDescription>Attributed from AI-booked opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${summary.recoveredRevenue}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>{limits.withinLimits ? 'Within limits' : 'Limits exceeded'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-lg font-semibold capitalize">{limits.plan}</p>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{limits.currentUsage.calls} calls</span>
                <span>${limits.currentUsage.cost} spent</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost breakdown</CardTitle>
          <CardDescription>Core AI infrastructure spend categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(summary.costBreakdown).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="text-sm font-semibold">${value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily cost vs recovered revenue</CardTitle>
          <CardDescription>Demonstrates operational ROI of the AI front desk</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
            <BarChart data={trend}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
              />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `$${v}`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="cost" fill="var(--color-cost)" radius={6} />
              <Bar dataKey="recovered" fill="var(--color-recovered)" radius={6} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Calls and minutes consumed in current period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{limits.currentUsage.calls} / {limits.callsIncluded} calls</span>
              <span className="text-muted-foreground">{Math.round(callsUsagePercent)}%</span>
            </div>
            <Progress value={callsUsagePercent} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{limits.currentUsage.minutes} / {limits.minutesIncluded} minutes</span>
              <span className="text-muted-foreground">{Math.round(minutesUsagePercent)}%</span>
            </div>
            <Progress value={minutesUsagePercent} className="h-2" />
          </div>

          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            ROI this period: <span className="font-medium text-foreground">{summary.roiMultiple}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
