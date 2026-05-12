"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  type AuditEntry,
  useGetAuditLogQuery,
} from "@/features/admin/adminApi";

const PAGE_SIZE = 50;

const ACTOR_TYPES = ["", "admin", "user", "system", "integration"];

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [actorType, setActorType] = useState("");

  const { data, isLoading } = useGetAuditLogQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    action: actionFilter || undefined,
    tenantId: tenantId || undefined,
  });

  const rawEntries = data?.data ?? [];
  const entries = actorType
    ? rawEntries.filter((e) => e.actorType === actorType)
    : rawEntries;
  const total = data?.total ?? 0;

  const columns: ColumnDef<AuditEntry>[] = [
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <code className="text-xs font-mono text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
          {row.original.action}
        </code>
      ),
    },
    {
      accessorKey: "actorType",
      header: "Actor",
      cell: ({ row }) => (
        <div>
          {row.original.actorType && (
            <StatusBadge value={row.original.actorType} />
          )}
          {row.original.actorId && (
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate max-w-[120px]">
              {row.original.actorId.slice(0, 8)}…
            </div>
          )}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: "entityType",
      header: "Entity",
      cell: ({ row }) => (
        <div>
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            {row.original.entityType || "—"}
          </span>
          {row.original.entityId && (
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate max-w-[100px]">
              {row.original.entityId.slice(0, 8)}…
            </div>
          )}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: "metadata",
      header: "Context",
      cell: ({ row }) => {
        const meta = row.original.metadata;
        if (!meta || Object.keys(meta).length === 0)
          return <span className="text-zinc-400">—</span>;
        const ip = meta.ip as string | undefined;
        const corrId = meta.correlationId as string | undefined;
        return (
          <div className="space-y-0.5">
            {ip && (
              <div className="text-[10px] font-mono text-zinc-400">{ip}</div>
            )}
            {corrId && (
              <div className="text-[10px] font-mono text-zinc-400 truncate max-w-[100px]">
                {corrId.slice(0, 8)}…
              </div>
            )}
          </div>
        );
      },
      size: 100,
    },
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: ({ row }) => (
        <time
          dateTime={row.original.createdAt}
          className="text-xs text-zinc-400 whitespace-nowrap"
          title={row.original.createdAt}
        >
          {format(new Date(row.original.createdAt), "MMM d, HH:mm:ss")}
        </time>
      ),
      size: 150,
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Audit Log"
          description="Administrative and system-level events"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Actor type filter */}
              <div className="flex gap-1">
                {ACTOR_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setActorType(t);
                      setPage(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      actorType === t
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {t === "" ? "All" : t}
                  </button>
                ))}
              </div>

              {/* Action search */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Filter action…"
                  className="pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-44 transition"
                />
              </div>

              {/* Tenant ID search */}
              <div className="relative">
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => {
                    setTenantId(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Tenant ID…"
                  className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-44 transition"
                />
              </div>
            </div>
          }
        />

        <BentoCard>
          {!isLoading && entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description="No events match the current filters."
            />
          ) : (
            <DataTable
              columns={columns}
              data={entries}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
              emptyMessage="No audit entries found"
            />
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
