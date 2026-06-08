"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  Database,
  DollarSign,
  HeartPulse,
  Layers,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  Area,
  AreaChart,
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
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetAnalyticsDashboardQuery,
  useGetAnalyticsHourlyQuery,
  useGetCallsQuery,
  useGetHealthQuery,
  useGetOpsBreakersQuery,
  useGetOpsCostQuery,
  useGetOpsQueuesQuery,
  useGetStatsQuery,
} from "@/features/admin/adminApi";
import { cn } from "@/lib/utils";

const POLL = 15_000;

const usd = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#10b981",
  neutral: "#3b82f6",
  negative: "#f43f5e",
  mixed: "#f59e0b",
};

const chartTooltip = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

export default function OverviewPage() {
  const { data: stats, isLoading: statsLoading } = useGetStatsQuery();
  const { data: health } = useGetHealthQuery(undefined, {
    pollingInterval: POLL,
  });
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery(
    { limit: 12 },
    { pollingInterval: POLL },
  );
  const { data: cost, isLoading: costLoading } = useGetOpsCostQuery({
    days: 7,
  });
  const { data: breakersData } = useGetOpsBreakersQuery(undefined, {
    pollingInterval: POLL,
  });
  const { data: queuesData } = useGetOpsQueuesQuery(undefined, {
    pollingInterval: POLL,
  });
  const { data: analytics, isLoading: analyticsLoading } =
    useGetAnalyticsDashboardQuery({ days: 30 });
  const { data: hourly, isLoading: hourlyLoading } = useGetAnalyticsHourlyQuery(
    {
      days: 7,
    },
  );

  // ── Derived: live ops status ──────────────────────────────────────────
  const breakers = Object.entries(breakersData?.breakers ?? {});
  const openBreakers = breakers.filter(([, b]) => b.state !== "closed");
  const queues = queuesData?.queues ?? [];
  const failedJobs = queues.reduce((s, q) => s + q.failed, 0);
  const waitingJobs = queues.reduce((s, q) => s + q.waiting, 0);
  const services = health?.services ?? {};
  const servicesDown = Object.values(services).filter((ok) => !ok).length;
  const degraded = openBreakers.length + failedJobs + servicesDown;
  const statusLabel =
    degraded === 0
      ? "All systems operational"
      : [
          openBreakers.length > 0 && `${openBreakers.length} breaker(s) open`,
          failedJobs > 0 && `${failedJobs} failed job(s)`,
          servicesDown > 0 && `${servicesDown} service(s) down`,
        ]
          .filter(Boolean)
          .join(" · ");

  // ── Derived: chart series ─────────────────────────────────────────────
  const hourlyData = (hourly?.data ?? []).map((p) => ({
    hour: p.hour.slice(5, 13),
    calls: p.calls,
  }));
  const callsPerDaySpark = (() => {
    const byDay: Record<string, number> = {};
    for (const p of hourly?.data ?? []) {
      const day = p.hour.slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + p.calls;
    }
    return Object.keys(byDay)
      .sort()
      .map((d) => byDay[d]);
  })();
  const costSpark = (cost?.daily ?? []).map((d) => d.cost);

  const sentimentData = Object.entries(analytics?.sentimentBreakdown ?? {}).map(
    ([name, value]) => ({ name, value }),
  );
  const recentCalls = callsData?.data ?? [];
  const topTenants = cost?.topTenants ?? [];
  const maxTenantCost = Math.max(...topTenants.map((t) => t.cost), 0.01);

  return (
    <DashboardShell>
      <div className="space-y-6 animate-fade-up">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gradient">
              Platform Pulse
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "size-2 rounded-full animate-pulse-dot",
                  degraded === 0 ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              <span
                className={cn(
                  "font-medium",
                  degraded === 0 ? "text-emerald-500" : "text-amber-500",
                )}
              >
                {statusLabel}
              </span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {format(new Date(), "EEEE, d MMM yyyy")}
          </span>
        </div>

        {/* Stat row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Calls today"
            value={stats?.totalCallsToday?.toLocaleString()}
            icon={Phone}
            isLoading={statsLoading}
            sparkline={callsPerDaySpark}
          />
          <StatCard
            label="Spend today"
            value={cost ? usd(cost.todayCost) : undefined}
            icon={DollarSign}
            isLoading={costLoading}
            sparkline={costSpark}
          />
          <StatCard
            label="Completion rate"
            value={
              analytics ? `${analytics.completionRate.toFixed(0)}%` : undefined
            }
            icon={CheckCircle2}
            isLoading={analyticsLoading}
            ring={analytics?.completionRate}
          />
          <StatCard
            label="Active clinics"
            value={stats?.activeTenants?.toLocaleString()}
            icon={Building2}
            isLoading={statsLoading}
            subtitle={
              stats
                ? `of ${stats.totalTenants.toLocaleString()} total`
                : undefined
            }
          />
        </div>

        {/* Main row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Call volume per hour (last 7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hourlyLoading ? (
                <Skeleton className="h-[260px] w-full" />
              ) : hourlyData.length === 0 ? (
                <p className="py-20 text-center text-xs text-muted-foreground">
                  No calls in this window.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={hourlyData}
                    margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--primary)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
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
                      fill="url(#vol)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Sentiment + booking */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sentiment</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <Skeleton className="h-[150px] w-full" />
                ) : sentimentData.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    No sentiment data.
                  </p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={34}
                          outerRadius={56}
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
                    <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
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

            <Card className="card-interactive">
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CalendarCheck className="size-3.5" />
                  Booking rate
                </div>
                <div className="text-2xl font-bold tabular-nums glow-primary">
                  {analytics ? `${analytics.bookingRate.toFixed(0)}%` : "—"}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Ops health strip */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/system" className="block">
            <Card
              className={cn(
                "card-interactive",
                openBreakers.length > 0 && "border-rose-500/40",
              )}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  {openBreakers.length > 0 ? (
                    <ShieldAlert className="size-4 text-rose-500" />
                  ) : (
                    <ShieldCheck className="size-4 text-emerald-500" />
                  )}
                  <span className="text-sm font-medium">Circuit breakers</span>
                </div>
                <StatusBadge
                  value={openBreakers.length > 0 ? "down" : "healthy"}
                  label={
                    breakers.length === 0
                      ? "n/a"
                      : openBreakers.length > 0
                        ? `${openBreakers.length} open`
                        : `${breakers.length} closed`
                  }
                />
              </CardContent>
            </Card>
          </Link>

          <Link href="/system" className="block">
            <Card
              className={cn(
                "card-interactive",
                failedJobs > 0 && "border-rose-500/40",
              )}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Job queues</span>
                </div>
                <StatusBadge
                  value={failedJobs > 0 ? "down" : "healthy"}
                  label={
                    failedJobs > 0
                      ? `${failedJobs} failed`
                      : `${waitingJobs} queued`
                  }
                />
              </CardContent>
            </Card>
          </Link>

          <Link href="/system" className="block">
            <Card
              className={cn(
                "card-interactive",
                servicesDown > 0 && "border-rose-500/40",
              )}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Core services</span>
                </div>
                <StatusBadge
                  value={servicesDown > 0 ? "down" : "healthy"}
                  label={
                    Object.keys(services).length === 0
                      ? "checking"
                      : servicesDown > 0
                        ? `${servicesDown} down`
                        : "online"
                  }
                />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Bottom row */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top clinics */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Top clinics (7d spend)
              </CardTitle>
              <Link
                href="/cost"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Cost →
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {costLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))
              ) : topTenants.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No clinic activity yet.
                </p>
              ) : (
                topTenants.slice(0, 6).map((t) => (
                  <div key={t.clinicName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate">
                        {t.clinicName}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {t.calls} calls · {usd(t.cost)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(t.cost / maxTenantCost) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Live activity feed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <HeartPulse className="size-4 text-primary" />
                Live activity
              </CardTitle>
              <Link
                href="/calls"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                All calls →
              </Link>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {callsLoading ? (
                <div className="space-y-2 px-6 py-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : recentCalls.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No recent calls.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {recentCalls.slice(0, 8).map((call) => {
                    const live =
                      call.status === "in_progress" ||
                      call.status === "started";
                    return (
                      <Link
                        key={call.id}
                        href={`/calls/${call.id}`}
                        className="flex items-center justify-between px-6 py-2.5 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              live
                                ? "bg-primary animate-pulse-dot"
                                : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="text-xs font-medium truncate">
                            {call.clinicName || "Unknown"}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground truncate">
                            {call.callerNumber || "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge value={call.status} />
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {call.startedAt
                              ? formatDistanceToNow(new Date(call.startedAt), {
                                  addSuffix: true,
                                })
                              : "—"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
