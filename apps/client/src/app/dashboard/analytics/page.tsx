'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { StatsCard } from '@/components/stats-card';
import { Badge } from '@/components/ui/badge';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Bar, BarChart, XAxis as BarXAxis, YAxis } from 'recharts';
import { DownloadIcon } from 'lucide-react';

const chartData = [
  { date: '2024-02-20', calls: 45, bookings: 12 },
  { date: '2024-02-21', calls: 52, bookings: 18 },
  { date: '2024-02-22', calls: 38, bookings: 10 },
  { date: '2024-02-23', calls: 61, bookings: 22 },
  { date: '2024-02-24', calls: 28, bookings: 8 },
  { date: '2024-02-25', calls: 55, bookings: 19 },
  { date: '2024-02-26', calls: 72, bookings: 24 },
  { date: '2024-02-27', calls: 48, bookings: 15 },
  { date: '2024-02-28', calls: 65, bookings: 21 },
  { date: '2024-02-29', calls: 41, bookings: 14 },
  { date: '2024-03-01', calls: 58, bookings: 20 },
  { date: '2024-03-02', calls: 67, bookings: 23 },
];

const hourlyCallData = [
  { hour: '8a', calls: 18, answered: 16 },
  { hour: '10a', calls: 34, answered: 30 },
  { hour: '12p', calls: 27, answered: 24 },
  { hour: '2p', calls: 41, answered: 36 },
  { hour: '4p', calls: 38, answered: 34 },
  { hour: '6p', calls: 22, answered: 21 },
  { hour: '8p', calls: 16, answered: 15 },
];

const weekdayPerformanceData = [
  { day: 'Mon', calls: 64, bookings: 21 },
  { day: 'Tue', calls: 71, bookings: 24 },
  { day: 'Wed', calls: 68, bookings: 23 },
  { day: 'Thu', calls: 75, bookings: 27 },
  { day: 'Fri', calls: 62, bookings: 20 },
  { day: 'Sat', calls: 49, bookings: 16 },
  { day: 'Sun', calls: 35, bookings: 11 },
];

const chartConfig = {
  calls: { label: 'Calls', color: 'var(--primary)' },
  bookings: { label: 'Bookings', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const hourlyChartConfig = {
  calls: { label: 'Calls', color: 'var(--primary)' },
  answered: { label: 'Answered', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const weekdayChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-4)' },
  bookings: { label: 'Bookings', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('7d');
  const [granularity, setGranularity] = useState('day');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Analytics</h2>
            <Badge variant="outline">Demo data</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Performance metrics and insights
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={dateRange}
            onValueChange={(value) => setDateRange(value ?? '7d')}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={granularity}
            onValueChange={(value) => setGranularity(value ?? 'day')}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <DownloadIcon className="mr-2 size-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Missed call capture rate"
          value="94%"
          trend={{ value: 12, label: 'vs previous period', positive: true }}
        />
        <StatsCard
          title="Call-to-booking conversion"
          value="34%"
          trend={{ value: 5, label: 'vs previous period', positive: true }}
        />
        <StatsCard
          title="Revenue recovered"
          value="$2,340"
          trend={{ value: 18, label: 'vs previous period', positive: true }}
        />
        <StatsCard
          title="Avg call duration"
          value="2m 15s"
          trend={{ value: -8, label: 'vs previous period', positive: false }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calls & bookings over time</CardTitle>
          <CardDescription>Track call volume and conversion</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart data={chartData}>
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
                <linearGradient id="fillBookings" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-bookings)"
                    stopOpacity={1}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-bookings)"
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
              <Area
                dataKey="bookings"
                type="natural"
                fill="url(#fillBookings)"
                stroke="var(--color-bookings)"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hourly call volume</CardTitle>
            <CardDescription>Understand peak call windows</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={hourlyChartConfig}
              className="h-[300px] w-full"
            >
              <BarChart data={hourlyCallData}>
                <CartesianGrid vertical={false} />
                <BarXAxis dataKey="hour" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill="var(--color-calls)" radius={6} />
                <Bar
                  dataKey="answered"
                  fill="var(--color-answered)"
                  radius={6}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekday performance</CardTitle>
            <CardDescription>Compare calls and bookings by day</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={weekdayChartConfig}
              className="h-[300px] w-full"
            >
              <BarChart data={weekdayPerformanceData}>
                <CartesianGrid vertical={false} />
                <BarXAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill="var(--color-calls)" radius={6} />
                <Bar
                  dataKey="bookings"
                  fill="var(--color-bookings)"
                  radius={6}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
