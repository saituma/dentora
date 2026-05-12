"use client";

import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, PhoneCall, XCircle, Zap } from "lucide-react";
import Link from "next/link";
import {
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
import { BentoCard, type BentoColor } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetCallsQuery,
  useGetHealthQuery,
  useGetStatsQuery,
  useGetTenantsQuery,
} from "@/features/admin/adminApi";

const CALL_STATUS_COLORS: Record<string, string> = {
  completed: "#10b981",
  in_progress: "#3b82f6",
  started: "#f59e0b",
  failed: "#f43f5e",
  escalated: "#f97316",
};

function timeAgo(dateStr?: string) {
  if (!dateStr) return "—";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

const bentoIconColor: Record<BentoColor, string> = {
  default: "text-zinc-600",
  green: "text-emerald-800",
  blue: "text-blue-800",
  yellow: "text-amber-800",
  purple: "text-purple-800",
  pink: "text-rose-800",
  dark: "text-white",
};

const bentoValueColor: Record<BentoColor, string> = {
  default: "text-zinc-900",
  green: "text-emerald-950",
  blue: "text-blue-950",
  yellow: "text-amber-950",
  purple: "text-purple-950",
  pink: "text-rose-950",
  dark: "text-white",
};

function StatCard({
  label,
  value,
  icon: Icon,
  bentoColor = "default",
  loading,
}: {
  label: string;
  value?: number | string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  bentoColor?: BentoColor;
  loading?: boolean;
}) {
  return (
    <BentoCard color={bentoColor}>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          {loading ? (
            <Skeleton className="h-9 w-20 rounded-lg" />
          ) : (
            <span
              className={`text-4xl font-bold tracking-tighter font-mono tabular-nums ${bentoValueColor[bentoColor]}`}
            >
              {value ?? "—"}
            </span>
          )}
          <span
            className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${bentoIconColor[bentoColor]}`}
          >
            {label}
          </span>
        </div>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center bg-black/8 shrink-0 ${bentoIconColor[bentoColor]}`}
        >
          <Icon size={18} />
        </div>
      </div>
    </BentoCard>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetStatsQuery();
  const { data: health } = useGetHealthQuery();
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({
    limit: 10,
  });
  const { data: tenantsData, isLoading: tenantsLoading } = useGetTenantsQuery({
    limit: 5,
  });

  const calls = callsData?.data ?? [];
  const tenants = tenantsData?.data ?? [];
  const services = health?.services ?? {};

  // Build pie data from recent calls
  const statusCounts: Record<string, number> = {};
  for (const c of calls) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  }
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // Top tenants bar chart
  const barData = tenants
    .filter((t) => (t.totalCalls ?? 0) > 0)
    .map((t) => ({
      name:
        t.clinicName.length > 14
          ? `${t.clinicName.slice(0, 12)}…`
          : t.clinicName,
      calls: t.totalCalls ?? 0,
    }));

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-emerald-500/10 text-emerald-600 text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Platform Admin
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-zinc-900">
            Platform Overview
          </h1>
        </div>

        {/* Stat cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-2 xl:grid-cols-4 gap-4"
        >
          <StatCard
            label="Active Clinics"
            value={stats?.activeTenants}
            icon={Building2}
            bentoColor="green"
            loading={statsLoading}
          />
          <StatCard
            label="Total Clinics"
            value={stats?.totalTenants}
            icon={Building2}
            bentoColor="blue"
            loading={statsLoading}
          />
          <StatCard
            label="Calls Today"
            value={stats?.totalCallsToday}
            icon={PhoneCall}
            bentoColor="yellow"
            loading={statsLoading}
          />
          <StatCard
            label="AI Providers"
            value={stats?.activeProviders}
            icon={Zap}
            bentoColor="purple"
            loading={statsLoading}
          />
        </motion.div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Recent calls */}
          <BentoCard
            className="xl:col-span-8"
            title="Recent Calls"
            description="Latest call sessions across all clinics"
          >
            <div className="mt-3 overflow-hidden rounded-xl border border-black/[0.06]">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/[0.025] text-zinc-500 text-xs font-medium">
                  <tr>
                    <th className="px-4 py-2.5">Clinic</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Caller</th>
                    <th className="px-4 py-2.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {callsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        <td colSpan={4} className="px-4 py-3">
                          <Skeleton className="h-4 w-full rounded" />
                        </td>
                      </tr>
                    ))
                  ) : calls.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-zinc-500 text-sm"
                      >
                        No calls yet
                      </td>
                    </tr>
                  ) : (
                    calls.map((call) => (
                      <tr
                        key={call.id}
                        className="hover:bg-black/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/calls/${call.id}`}
                            className="font-medium text-zinc-900 hover:text-emerald-600 transition-colors truncate max-w-[140px] block"
                          >
                            {call.clinicName || "Unknown"}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={call.status} dot />
                        </td>
                        <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                          {call.callerNumber || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400 text-xs">
                          {timeAgo(call.startedAt || call.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-right">
              <Link
                href="/calls"
                className="text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
              >
                View all calls →
              </Link>
            </div>
          </BentoCard>

          {/* Right column */}
          <div className="xl:col-span-4 space-y-5">
            {/* System health */}
            <BentoCard title="System Health">
              <div className="mt-2 space-y-2">
                {Object.keys(services).length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">
                    Checking…
                  </p>
                ) : (
                  Object.entries(services).map(([name, ok]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/[0.025] border border-black/[0.06]"
                    >
                      <span className="text-xs font-medium text-zinc-800 capitalize">
                        {name}
                      </span>
                      {ok ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : (
                        <XCircle size={14} className="text-rose-500" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </BentoCard>

            {/* Call status breakdown */}
            {pieData.length > 0 && (
              <BentoCard title="Call Status Mix">
                <div className="mt-2">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={64}
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
                          borderRadius: "0.75rem",
                          fontSize: "11px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center mt-1">
                    {pieData.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-1.5 text-[10px] text-zinc-500"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor:
                              CALL_STATUS_COLORS[entry.name] ?? "#71717a",
                          }}
                        />
                        {entry.name.replace("_", " ")} ({entry.value})
                      </div>
                    ))}
                  </div>
                </div>
              </BentoCard>
            )}
          </div>
        </div>

        {/* Top clinics bar chart */}
        {barData.length > 0 && (
          <BentoCard
            title="Top Clinics by Call Volume"
            description="Total calls per clinic"
          >
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} barSize={32}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.75rem",
                      fontSize: "11px",
                    }}
                    cursor={{ fill: "var(--accent)" }}
                  />
                  <Bar dataKey="calls" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </BentoCard>
        )}

        {/* Tenants snapshot */}
        {!tenantsLoading && tenants.length > 0 && (
          <BentoCard title="Recent Clinics" icon={<Building2 size={14} />}>
            <div className="mt-2 divide-y divide-black/[0.04]">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <Link
                      href={`/tenants/${t.id}`}
                      className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-emerald-500 transition-colors"
                    >
                      {t.clinicName}
                    </Link>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {t.plan} plan · {timeAgo(t.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-zinc-400">
                      {(t.totalCalls ?? 0).toLocaleString()} calls
                    </span>
                    <StatusBadge value={t.status} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <Link
                href="/tenants"
                className="text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
              >
                View all clinics →
              </Link>
            </div>
          </BentoCard>
        )}
      </div>
    </DashboardShell>
  );
}
