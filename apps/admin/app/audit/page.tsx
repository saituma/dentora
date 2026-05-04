"use client";

import { ScrollText } from "lucide-react";
import { useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { useGetAuditLogQuery } from "@/features/admin/adminApi";

export default function AuditPage() {
  const [action, setAction] = useState("");
  const { data, isLoading } = useGetAuditLogQuery({
    limit: 50,
    offset: 0,
    action: action || undefined,
  });
  const entries = data?.data ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
              Audit Log
            </h1>
            <p className="text-sm text-zinc-500">
              Administrative and system-level events
            </p>
          </div>
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filter action (e.g. admin.*)"
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-64 transition"
          />
        </div>

        <BentoCard title="Recent Events" icon={<ScrollText size={14} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-zinc-500 dark:text-zinc-400 text-xs font-medium border-b border-zinc-100 dark:border-zinc-800/50">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      Loading audit entries...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      No entries found
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                        {entry.action}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {entry.actorType || "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {entry.entityType || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
