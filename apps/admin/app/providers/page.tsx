"use client";

import { Activity, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetHealthQuery } from "@/features/admin/adminApi";

export default function ProvidersPage() {
  const { data, isLoading, refetch, isFetching } = useGetHealthQuery();
  const services = data?.services ?? {};
  const entries = Object.entries(services);

  const healthyCount = entries.filter(([, ok]) => ok).length;
  const totalCount = entries.length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Providers"
          description="Health status of platform dependencies"
          badge={
            totalCount > 0 ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  healthyCount === totalCount
                    ? "bg-emerald-500/10 text-emerald-500"
                    : healthyCount === 0
                      ? "bg-rose-500/10 text-rose-500"
                      : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {healthyCount}/{totalCount} healthy
              </span>
            ) : null
          }
          actions={
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={isFetching ? "animate-spin" : ""}
              />
              Refresh
            </button>
          }
        />

        <BentoCard>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`sk-${i}`} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No provider data"
              description="Provider health information is not yet available."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entries.map(([name, ok]) => (
                <div
                  key={name}
                  className={`flex items-center justify-between rounded-xl border p-4 transition ${
                    ok
                      ? "border-emerald-200/50 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10"
                      : "border-rose-200/50 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-900/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        ok
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-rose-500/10 text-rose-500"
                      }`}
                    >
                      <Activity size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                        {name}
                      </div>
                      <div
                        className={`text-[10px] font-medium uppercase tracking-wider ${
                          ok ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {ok ? "Operational" : "Unavailable"}
                      </div>
                    </div>
                  </div>
                  {ok ? (
                    <CheckCircle2
                      size={18}
                      className="text-emerald-500 shrink-0"
                    />
                  ) : (
                    <XCircle size={18} className="text-rose-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
