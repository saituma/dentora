"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DollarSign, Server, TrendingUp } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetOpsCostQuery } from "@/features/admin/adminApi";

const usd = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(n);

const chartTooltip = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

type TopTenant = { clinicName: string; calls: number; cost: number };

const tenantColumns: ColumnDef<TopTenant>[] = [
  {
    accessorKey: "clinicName",
    header: "Clinic",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.clinicName}</span>
    ),
  },
  {
    accessorKey: "calls",
    header: "Calls",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.calls.toLocaleString()}
      </span>
    ),
    size: 100,
  },
  {
    accessorKey: "cost",
    header: "Spend",
    cell: ({ row }) => (
      <span className="tabular-nums font-medium">{usd(row.original.cost)}</span>
    ),
    size: 120,
  },
];

export default function CostPage() {
  const [days, setDays] = useQueryState("days", parseAsInteger.withDefault(7));
  const { data, isLoading, isFetching } = useGetOpsCostQuery({ days });

  const daily = data?.daily ?? [];
  const byProvider = data?.byProvider ?? [];
  const topTenants = data?.topTenants ?? [];
  const topProvider = byProvider[0];

  return (
    <DashboardShell>
      <div className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Cost &amp; Billing
            </h1>
            <p className="text-sm text-muted-foreground">
              Platform-wide spend across all clinics and providers.
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

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Spend today",
              value: data ? usd(data.todayCost) : undefined,
              icon: DollarSign,
            },
            {
              title: `Spend last ${days}d`,
              value: data ? usd(data.totalCost) : undefined,
              icon: TrendingUp,
            },
            {
              title: "Top provider",
              value: topProvider
                ? `${topProvider.provider} · ${usd(topProvider.cost)}`
                : "—",
              icon: Server,
            },
          ].map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-28" />
                ) : (
                  <div className="text-2xl font-bold tabular-nums glow-primary">
                    {value ?? "—"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Daily spend (last {days} days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart
                    data={daily}
                    margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(d: string) => d.slice(5)}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={chartTooltip}
                      formatter={(v) => usd(Number(v))}
                    />
                    <Area
                      type="monotone"
                      dataKey="cost"
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Spend by provider
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : byProvider.length === 0 ? (
                <p className="py-12 text-center text-xs text-muted-foreground">
                  No provider spend in this window.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={byProvider}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
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
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      type="category"
                      dataKey="provider"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={70}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={chartTooltip}
                      formatter={(v) => usd(Number(v))}
                      cursor={{ fill: "var(--accent)" }}
                    />
                    <Bar
                      dataKey="cost"
                      fill="var(--primary)"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top tenants */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top clinics by volume &amp; spend
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <DataTable
              columns={tenantColumns}
              data={topTenants}
              isLoading={isLoading || isFetching}
              emptyMessage="No clinic activity in this window."
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
