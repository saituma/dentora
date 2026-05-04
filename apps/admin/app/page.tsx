"use client";

import { motion } from "framer-motion";
import { Activity, Building2, PhoneCall } from "lucide-react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  useGetCallsQuery,
  useGetHealthQuery,
  useGetStatsQuery,
  useGetTenantsQuery,
} from "@/features/admin/adminApi";

const statusDot = (ok: boolean) => (
  <div
    className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`}
  />
);

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500",
  in_progress: "bg-blue-500 animate-pulse",
  started: "bg-amber-500 animate-pulse",
  failed: "bg-rose-500",
  escalated: "bg-orange-500",
};

function timeAgo(dateStr?: string) {
  if (!dateStr) return "-";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function DashboardPage() {
  const { data: stats } = useGetStatsQuery();
  const { data: health } = useGetHealthQuery();
  const { data: callsData } = useGetCallsQuery({ limit: 8 });
  const { data: tenantsData } = useGetTenantsQuery({ limit: 5 });

  const calls = callsData?.data ?? [];
  const tenants = tenantsData?.data ?? [];

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] uppercase tracking-[0.2em] font-bold">
              Platform Admin
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
            Platform Overview
          </h1>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.08 }}
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
        >
          <BentoCard>
            <StatItem
              label="Active Clinics"
              value={stats?.activeTenants ?? "-"}
              icon={Building2}
              color="text-amber-500"
            />
          </BentoCard>
          <BentoCard>
            <StatItem
              label="Total Clinics"
              value={stats?.totalTenants ?? "-"}
              icon={Building2}
              color="text-blue-500"
            />
          </BentoCard>
          <BentoCard>
            <StatItem
              label="Calls Today"
              value={stats?.totalCallsToday ?? "-"}
              icon={PhoneCall}
              color="text-emerald-500"
            />
          </BentoCard>
          <BentoCard>
            <StatItem
              label="AI Providers"
              value={stats?.activeProviders ?? "-"}
              icon={Activity}
              color="text-violet-500"
            />
          </BentoCard>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <BentoCard
            className="xl:col-span-8"
            title="Recent Calls"
            description="Latest calls across all clinics"
          >
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800/50">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-xs font-medium">
                  <tr>
                    <th className="px-4 py-2.5">Clinic</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Caller</th>
                    <th className="px-4 py-2.5">Intent</th>
                    <th className="px-4 py-2.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {calls.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-zinc-500"
                      >
                        No calls yet
                      </td>
                    </tr>
                  ) : (
                    calls.map((call) => (
                      <tr
                        key={call.id}
                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">
                          {call.clinicName || "Unknown"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusColors[call.status] ?? "bg-zinc-400"}`}
                            />
                            {call.status}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
                          {call.callerNumber || "-"}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs truncate max-w-[140px]">
                          {call.intentSummary || "-"}
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
          </BentoCard>

          <div className="xl:col-span-4 space-y-5">
            <BentoCard title="System Health">
              <div className="mt-2 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <Activity size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">Database</div>
                      <div className="text-[10px] text-zinc-500">
                        {health?.status ?? "checking..."}
                      </div>
                    </div>
                  </div>
                  {statusDot(health?.services?.database ?? false)}
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Activity size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">Redis</div>
                      <div className="text-[10px] text-zinc-500">
                        Cache layer
                      </div>
                    </div>
                  </div>
                  {statusDot(health?.services?.redis ?? false)}
                </div>
              </div>
            </BentoCard>

            <BentoCard title="Top Clinics">
              <div className="mt-2 space-y-2">
                {tenants.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">
                    No clinics yet
                  </p>
                ) : (
                  tenants.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {t.clinicName}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {t.plan} plan
                        </div>
                      </div>
                      <div className="text-xs font-mono text-zinc-400">
                        {t.totalCalls ?? 0} calls
                      </div>
                    </div>
                  ))
                )}
              </div>
            </BentoCard>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function StatItem({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-3xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50 font-mono">
        {value}
      </span>
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-medium">
        <Icon size={14} className={color} />
        {label}
      </div>
    </div>
  );
}
