'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/stats-card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis as BarXAxis,
  YAxis,
} from 'recharts';
import { PhoneIcon, CalendarIcon } from 'lucide-react';

const performanceChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
  booked: { label: 'Booked', color: 'var(--chart-2)' },
  resolved: { label: 'Resolved', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const intentChartConfig = {
  count: { label: 'Requests', color: 'var(--primary)' },
} satisfies ChartConfig;

const channelMixChartConfig = {
  google: { label: 'Google Ads', color: 'var(--chart-2)' },
  website: { label: 'Website', color: 'var(--chart-1)' },
  returning: { label: 'Returning Patients', color: 'var(--chart-3)' },
  referrals: { label: 'Referrals', color: 'var(--chart-4)' },
} satisfies ChartConfig;

const dailyPerformance = [
  { day: 'Mon', calls: 62, booked: 26, resolved: 57 },
  { day: 'Tue', calls: 74, booked: 32, resolved: 68 },
  { day: 'Wed', calls: 79, booked: 36, resolved: 73 },
  { day: 'Thu', calls: 86, booked: 39, resolved: 80 },
  { day: 'Fri', calls: 92, booked: 44, resolved: 86 },
  { day: 'Sat', calls: 58, booked: 22, resolved: 52 },
  { day: 'Sun', calls: 41, booked: 14, resolved: 37 },
];

const intentBreakdown = [
  { intent: 'Emergency Pain', count: 48 },
  { intent: 'Cleaning & Hygiene', count: 63 },
  { intent: 'New Patient Consult', count: 37 },
  { intent: 'Reschedule Request', count: 22 },
  { intent: 'Insurance Questions', count: 19 },
];

const channelMix = [
  { key: 'website', channel: 'Website', value: 36 },
  { key: 'google', channel: 'Google Ads', value: 31 },
  { key: 'returning', channel: 'Returning', value: 21 },
  { key: 'referrals', channel: 'Referrals', value: 12 },
] as const;

const recentActivity = [
  { id: 'A-4412', caller: '(555) 210-8841', reason: 'Tooth pain', result: 'Booked today 4:30 PM' },
  { id: 'A-4408', caller: '(555) 339-7710', reason: 'Cleaning follow-up', result: 'Booked next Tue' },
  { id: 'A-4402', caller: '(555) 920-0445', reason: 'Crown consultation', result: 'Transferred to front desk' },
  { id: 'A-4395', caller: '(555) 117-0398', reason: 'Billing question', result: 'Resolved by AI' },
  { id: 'A-4387', caller: '(555) 702-6604', reason: 'Whitening inquiry', result: 'Callback requested' },
];

export default function DashboardOverviewPage() {
  const hasActiveCalendar = true;


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">24/7 AI front desk snapshot: captured demand, booked patients, and recovered revenue</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total calls"
          value="492"
          description="Inbound calls handled in the last 7 days"
          trend={{ value: 18.4, label: 'Stronger call capture week-over-week' }}
        />
        <StatsCard
          title="Missed-call capture"
          value="93.6%"
          description="Calls answered by AI before going to voicemail"
          trend={{ value: 8.7, label: 'More opportunities captured after-hours' }}
        />
        <StatsCard
          title="Call-to-booking rate"
          value="46.9%"
          description="Calls converted to appointments"
          trend={{ value: 6.1, label: 'Higher booking conversion quality' }}
        />
        <StatsCard
          title="Recovered revenue"
          value="$23.9k"
          description="Estimated value from AI-booked opportunities"
          trend={{ value: 12.3, label: 'Revenue capture growing with volume' }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Weekly performance trend</CardTitle>
            <CardDescription>Call capture, booked appointments, and successful AI resolutions</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={performanceChartConfig} className="h-[280px] w-full">
              <AreaChart data={dailyPerformance}>
                <defs>
                  <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <BarXAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  fill="url(#fillCalls)"
                  stroke="var(--color-calls)"
                  strokeWidth={2}
                />
                <Area type="monotone" dataKey="booked" fill="none" stroke="var(--color-booked)" strokeWidth={2} />
                <Area type="monotone" dataKey="resolved" fill="none" stroke="var(--color-resolved)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead channel mix</CardTitle>
            <CardDescription>Acquisition sources feeding new patient demand</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={channelMixChartConfig} className="h-[280px] w-full">
              <PieChart>
                <Pie
                  data={channelMix}
                  dataKey="value"
                  nameKey="channel"
                  innerRadius={56}
                  outerRadius={84}
                  paddingAngle={2}
                >
                  {channelMix.map((entry) => (
                    <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top caller intents</CardTitle>
            <CardDescription>Highest-volume patient requests handled by the AI receptionist</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={intentChartConfig} className="h-[260px] w-full">
              <BarChart data={intentBreakdown} layout="vertical" margin={{ left: 16, right: 12 }}>
                <CartesianGrid horizontal={false} />
                <BarXAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="intent"
                  tickLine={false}
                  axisLine={false}
                  width={130}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={6} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest booking and resolution outcomes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <PhoneIcon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{activity.caller}</p>
                    <p className="text-xs text-muted-foreground">{activity.reason}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{activity.result}</p>
              </div>
            ))}
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard/calls">View full call history</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-5" />
            {hasActiveCalendar
              ? 'Calendar connected'
              : 'Next step: Connect your calendar'}
          </CardTitle>
          <CardDescription>
            {hasActiveCalendar
              ? 'Manage calendar sync and connection health from Integrations'
              : 'Connect Google Calendar or Outlook to enable AI appointment booking'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant={hasActiveCalendar ? 'outline' : 'default'} asChild>
            <Link href="/dashboard/integrations">
              {hasActiveCalendar ? 'Manage integrations' : 'Connect calendar'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
