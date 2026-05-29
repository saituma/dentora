"use client";

import { CalendarCheck, CheckCircle2, Phone, Timer } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetAnalyticsDashboardQuery,
  useGetAnalyticsHourlyQuery,
} from "@/features/admin/adminApi";

const chartTooltip = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#10b981",
  neutral: "#3b82f6",
  negative: "#f43f5e",
  mixed: "#f59e0b",
};

export default function AnalyticsPage() {
  const [days, setDays] = useQueryState("days", parseAsInteger.withDefault(30));
  const { data: stats, isLoading } = useGetAnalyticsDashboardQuery({ days });
  const hourlyDays = Math.min(days, 7);
  const { data: hourly, isLoading: hourlyLoading } = useGetAnalyticsHourlyQuery(
    {
      days: hourlyDays,
    },
  );

  const sentimentData = Object.entries(stats?.sentimentBreakdown ?? {}).map(
    ([name, value]) => ({ name, value }),
  );
  const intentData = (stats?.topIntents ?? []).slice(0, 8);
  const hourlyData = (hourly?.data ?? []).map((p) => ({
    hour: p.hour.slice(5, 13),
    calls: p.calls,
  }));

  const kpis = [
    {
      title: "Total calls",
      value: stats?.totalCalls?.toLocaleString(),
      icon: Phone,
    },
    {
      title: "Completion rate",
      value: stats ? `${stats.completionRate.toFixed(1)}%` : undefined,
      icon: CheckCircle2,
    },
    {
      title: "Booking rate",
      value: stats ? `${stats.bookingRate.toFixed(1)}%` : undefined,
      icon: CalendarCheck,
    },
    {
      title: "Avg latency",
      value: stats
        ? `${stats.averageLatencyMs.toLocaleString()} ms`
        : undefined,
      icon: Timer,
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Platform-wide call quality and conversation insights.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold tabular-nums">
                    {value ?? "—"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Hourly volume */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Call volume per hour (last {hourlyDays}d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hourlyLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : hourlyData.length === 0 ? (
                <p className="py-16 text-center text-xs text-muted-foreground">
                  No calls in this window.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={hourlyData}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      className="fill-muted-foreground"
                    />
                    <Tooltip contentStyle={chartTooltip} />
                    <Area
                      type="monotone"
                      dataKey="calls"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="var(--primary)"
                      fillOpacity={0.12}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Sentiment pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : sentimentData.length === 0 ? (
                <p className="py-16 text-center text-xs text-muted-foreground">
                  No sentiment data.
                </p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={64}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {sentimentData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={SENTIMENT_COLORS[entry.name] ?? "#71717a"}
                          />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {sentimentData.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor:
                              SENTIMENT_COLORS[entry.name] ?? "#71717a",
                          }}
                        />
                        {entry.name}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top intents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top intents</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : intentData.length === 0 ? (
              <p className="py-16 text-center text-xs text-muted-foreground">
                No intents detected.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(160, intentData.length * 34)}
              >
                <BarChart
                  data={intentData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    className="stroke-border"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="intent"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={140}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={chartTooltip}
                    cursor={{ fill: "var(--accent)" }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--primary)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
