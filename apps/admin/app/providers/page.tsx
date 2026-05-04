"use client";

import { Activity, ShieldCheck } from "lucide-react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { useGetHealthQuery } from "@/features/admin/adminApi";

export default function ProvidersPage() {
  const { data, isLoading } = useGetHealthQuery();
  const services = data?.services ?? {};

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
            Providers
          </h1>
          <p className="text-sm text-zinc-500">
            Health snapshot for platform dependencies
          </p>
        </div>

        <BentoCard title="Provider Status" icon={<ShieldCheck size={14} />}>
          {isLoading ? (
            <p className="text-sm text-zinc-500">Loading provider status...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(services).map(([name, ok]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800/60 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                      {name}
                    </span>
                  </div>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
                  >
                    {ok ? "healthy" : "down"}
                  </span>
                </div>
              ))}
              {Object.keys(services).length === 0 && (
                <p className="text-sm text-zinc-500">
                  No provider data available
                </p>
              )}
            </div>
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
