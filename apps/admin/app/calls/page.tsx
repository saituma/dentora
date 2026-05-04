"use client";

import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { useGetCallsQuery } from "@/features/admin/adminApi";

const statusBadge: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-400",
  in_progress: "bg-blue-500/10 text-blue-400",
  started: "bg-amber-500/10 text-amber-400",
  failed: "bg-rose-500/10 text-rose-400",
  escalated: "bg-orange-500/10 text-orange-400",
};

export default function CallsPage() {
  const [page, setPage] = useState(0);
  const limit = 20;
  const { data, isLoading } = useGetCallsQuery({ limit, offset: page * limit });
  const calls = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
            Calls
          </h1>
          <p className="text-sm text-zinc-500">
            Recent and in-flight call sessions
          </p>
        </div>

        <BentoCard title="Call Sessions" icon={<Phone size={14} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-zinc-500 dark:text-zinc-400 text-xs font-medium border-b border-zinc-100 dark:border-zinc-800/50">
                <tr>
                  <th className="px-4 py-3">Clinic</th>
                  <th className="px-4 py-3">Caller</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Intent</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      Loading calls...
                    </td>
                  </tr>
                ) : calls.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      No calls found
                    </td>
                  </tr>
                ) : (
                  calls.map((call) => (
                    <tr
                      key={call.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {call.clinicName || "Unknown"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                        {call.callerNumber || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadge[call.status] ?? "bg-zinc-500/10 text-zinc-400"}`}
                        >
                          {call.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        {call.intentSummary || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 font-mono text-xs">
                        {call.durationSeconds ?? 0}s
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
