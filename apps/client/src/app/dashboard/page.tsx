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
import { Badge } from '@/components/ui/badge';
import { StatsCard } from '@/components/stats-card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Bar, BarChart, XAxis as BarXAxis, YAxis } from 'recharts';
import { PieChart, Pie, Cell } from 'recharts';
import { PhoneIcon, CalendarIcon } from 'lucide-react';

const callsOverTimeData = [
  { date: '2024-02-26', calls: 12 },
  { date: '2024-02-27', calls: 19 },
  { date: '2024-02-28', calls: 15 },
  { date: '2024-02-29', calls: 22 },
  { date: '2024-03-01', calls: 8 },
  { date: '2024-03-02', calls: 5 },
  { date: '2024-03-03', calls: 18 },
];

const callsByHourData = [
  { hour: '9am', calls: 12 },
  { hour: '10am', calls: 18 },
  { hour: '11am', calls: 24 },
  { hour: '12pm', calls: 15 },
  { hour: '1pm', calls: 20 },
  { hour: '2pm', calls: 22 },
  { hour: '3pm', calls: 19 },
  { hour: '4pm', calls: 14 },
  { hour: '5pm', calls: 8 },
];

const outcomeData = [
  { name: 'Booked', value: 45, color: 'var(--chart-1)' },
  { name: 'FAQ', value: 30, color: 'var(--chart-2)' },
  { name: 'Transferred', value: 15, color: 'var(--chart-3)' },
  { name: 'Abandoned', value: 10, color: 'var(--chart-4)' },
];

const recentCalls = [
  { id: '1', caller: '+1 555-0123', outcome: 'Booked', time: '2 min ago' },
  { id: '2', caller: '+1 555-0456', outcome: 'FAQ', time: '15 min ago' },
  {
    id: '3',
    caller: '+1 555-0789',
    outcome: 'Transferred',
    time: '32 min ago',
  },
  { id: '4', caller: '+1 555-0321', outcome: 'Booked', time: '1 hr ago' },
  { id: '5', caller: '+1 555-0654', outcome: 'FAQ', time: '2 hr ago' },
];

const chartConfig = {
  calls: { label: 'Calls', color: 'var(--primary)' },
} satisfies ChartConfig;

export default function DashboardOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Overview</h2>
        <Badge variant="outline">Demo data</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Missed call capture rate"
          value="94%"
          trend={{ value: 12, label: 'vs last 7 days', positive: true }}
          description="Calls answered outside business hours"
        />
        <StatsCard
          title="Call-to-booking conversion"
          value="34%"
          trend={{ value: 5, label: 'vs last 7 days', positive: true }}
          description="Calls that resulted in a booking"
        />
        <StatsCard
          title="Revenue recovered"
          value="$2,340"
          trend={{ value: 18, label: 'vs last 30 days', positive: true }}
          description="From AI-booked appointments"
        />
        <StatsCard
          title="Total calls"
          value="247"
          trend={{ value: -3, label: 'vs last 7 days', positive: false }}
          description="Last 7 days"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calls over time</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <AreaChart data={callsOverTimeData}>
                <defs>
                  <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-calls)"
                      stopOpacity={1}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-calls)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="calls"
                  type="natural"
                  fill="url(#fillCalls)"
                  stroke="var(--color-calls)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome breakdown</CardTitle>
            <CardDescription>By call outcome</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[250px] w-full">
              <PieChart>
                <Pie
                  data={outcomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {outcomeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => [`${value}%`, '']}
                    />
                  }
                />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="self-start lg:col-span-2">
          <CardHeader>
            <CardTitle>Calls by hour</CardTitle>
            <CardDescription>Peak call times</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={callsByHourData}>
                <BarXAxis dataKey="hour" tickLine={false} />
                <YAxis hide />
                <Bar
                  dataKey="calls"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest calls</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <PhoneIcon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{call.caller}</p>
                      <p className="text-xs text-muted-foreground">
                        {call.outcome} · {call.time}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/calls">View</Link>
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link href="/dashboard/calls">View all calls</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-5" />
            Next step: Connect your calendar
          </CardTitle>
          <CardDescription>
            Connect Google Calendar or Outlook to enable AI appointment booking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/integrations">Connect calendar</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
