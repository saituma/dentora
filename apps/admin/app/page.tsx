"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Building2,
  CheckCircle2,
  Phone,
  ShieldCheck,
  XCircle,
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
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CallSession,
  useGetCallsQuery,
  useGetHealthQuery,
  useGetStatsQuery,
} from "@/features/admin/adminApi";

const CALL_STATUS_COLORS: Record<string, string> = {
  completed: "#10b981",
  in_progress: "#3b82f6",
  started: "#f59e0b",
  failed: "#f43f5e",
  escalated: "#f97316",
};

function buildChartData(calls: CallSession[]) {
  const buckets: Record<string, number> = {};
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now - i * 60 * 60 * 1000);
    const key = `${d.getHours().toString().padStart(2, "0")}:00`;
    buckets[key] = 0;
  }
  for (const call of calls) {
    if (!call.startedAt) continue;
    const h = new Date(call.startedAt).getHours();
    const key = `${h.toString().padStart(2, "0")}:00`;
    if (key in buckets) buckets[key]++;
  }
  return Object.entries(buckets).map(([hour, count]) => ({ hour, count }));
}

const recentColumns: ColumnDef<CallSession>[] = [
  {
    accessorKey: "clinicName",
    header: "Clinic",
    cell: ({ row }) => (
      <span className="font-medium truncate max-w-[140px] block">
        {row.original.clinicName || "Unknown"}
      </span>
    ),
  },
  {
    accessorKey: "callerNumber",
    header: "Caller",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.callerNumber || "—"}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
    size: 110,
  },
  {
    accessorKey: "startedAt",
    header: "Started",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.startedAt
          ? formatDistanceToNow(new Date(row.original.startedAt), {
              addSuffix: true,
            })
          : "—"}
      </span>
    ),
    size: 120,
  },
  {
    id: "link",
    enableHiding: false,
    size: 60,
    cell: ({ row }) => (
      <Link
        href={`/calls/${row.original.id}`}
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        View →
      </Link>
    ),
  },
];

export default function OverviewPage() {
  const { data: stats, isLoading: statsLoading } = useGetStatsQuery();
  const { data: health } = useGetHealthQuery();
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({
    limit: 50,
  });

  const recentCalls = (callsData?.data ?? []).slice(0, 10);
  const chartData = buildChartData(callsData?.data ?? []);
  const services = health?.services ?? {};

  const statusCounts: Record<string, number> = {};
  for (const c of callsData?.data ?? []) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  }
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Active Clinics",
              value: stats?.activeTenants,
              icon: Building2,
            },
            {
              title: "Calls Today",
              value: stats?.totalCallsToday,
              icon: Phone,
            },
            {
              title: "Total Clinics",
              value: stats?.totalTenants,
              icon: Activity,
            },
            {
              title: "Active Providers",
              value: stats?.activeProviders,
              icon: ShieldCheck,
            },
          ].map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold tabular-nums">
                    {(value ?? 0).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Area chart — calls/hour */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Calls per hour (last 24 h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callsLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={3}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="var(--primary)"
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Right col: pie + health */}
          <div className="space-y-4">
            {pieData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Status mix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={32}
                        outerRadius={52}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={CALL_STATUS_COLORS[entry.name] ?? "#71717a"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius)",
                          fontSize: 11,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {pieData.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor:
                              CALL_STATUS_COLORS[entry.name] ?? "#71717a",
                          }}
                        />
                        {entry.name.replace("_", " ")}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  System health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {Object.keys(services).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Checking…</p>
                ) : (
                  Object.entries(services).map(([name, ok]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="capitalize text-muted-foreground">
                        {name}
                      </span>
                      {ok ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="size-3.5 text-destructive" />
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent calls table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
            <Link
              href="/calls"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              View all →
            </Link>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <DataTable
              columns={recentColumns}
              data={recentCalls}
              isLoading={callsLoading}
              emptyMessage="No recent calls."
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
