"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  useGetTenantsQuery,
  useUpdateTenantStatusMutation,
} from "@/features/admin/adminApi";

const planBadge: Record<string, string> = {
  starter: "bg-zinc-500/10 text-zinc-400",
  professional: "bg-blue-500/10 text-blue-400",
  enterprise: "bg-violet-500/10 text-violet-400",
};

const statusBadge: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400",
  suspended: "bg-amber-500/10 text-amber-400",
  archived: "bg-zinc-500/10 text-zinc-500",
};
const loadingRowKeys = ["row-1", "row-2", "row-3", "row-4", "row-5"];

export default function TenantsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;
  const { data, isLoading } = useGetTenantsQuery({
    limit,
    offset: page * limit,
    search: search || undefined,
  });
  const [updateStatus] = useUpdateTenantStatusMutation();
  const tenants = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleStatusChange = async (tenantId: string, status: string) => {
    try {
      await updateStatus({ tenantId, status }).unwrap();
      toast.success(`Tenant ${status}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
              Clinics
            </h1>
            <p className="text-sm text-zinc-500">{total} total clinics</p>
          </div>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search clinics..."
              className="pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-64 transition"
            />
          </div>
        </div>

        <BentoCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-zinc-500 dark:text-zinc-400 text-xs font-medium border-b border-zinc-100 dark:border-zinc-800/50">
                <tr>
                  <th className="px-4 py-3">Clinic</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Calls</th>
                  <th className="px-4 py-3">Numbers</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {isLoading ? (
                  loadingRowKeys.map((rowKey) => (
                    <tr key={rowKey}>
                      <td colSpan={7} className="px-4 py-4">
                        <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : tenants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      No clinics found
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {t.clinicName}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {t.clinicSlug}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${planBadge[t.plan] ?? "bg-zinc-500/10 text-zinc-400"}`}
                        >
                          {t.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadge[t.status] ?? ""}`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {t.totalCalls ?? 0}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {t.activeNumbers ?? 0}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          value={t.status}
                          onChange={(e) =>
                            handleStatusChange(t.id, e.target.value)
                          }
                          className="text-xs bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-zinc-400 focus:outline-none"
                        >
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800/50">
              <span className="text-xs text-zinc-500">
                Page {page + 1} of {Math.ceil(total / limit)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= total}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
