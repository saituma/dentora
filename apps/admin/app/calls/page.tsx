"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Phone, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { type CallSession, useGetCallsQuery } from "@/features/admin/adminApi";

const PAGE_SIZE = 25;
const STATUSES = [
  "",
  "completed",
  "in_progress",
  "started",
  "failed",
  "escalated",
];

export default function CallsPage() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");

  const { data, isLoading } = useGetCallsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: statusFilter || undefined,
  });

  const calls = (data?.data ?? []).filter((c) =>
    tenantSearch
      ? c.clinicName?.toLowerCase().includes(tenantSearch.toLowerCase())
      : true,
  );
  const total = data?.total ?? 0;

  const columns: ColumnDef<CallSession>[] = [
    {
      accessorKey: "clinicName",
      header: "Clinic",
      cell: ({ row }) => (
        <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px] block">
          {row.original.clinicName || "Unknown"}
        </span>
      ),
    },
    {
      accessorKey: "callerNumber",
      header: "Caller",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-500">
          {row.original.callerNumber || "—"}
        </span>
      ),
      size: 130,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
      size: 120,
    },
    {
      accessorKey: "intentSummary",
      header: "Intent",
      cell: ({ row }) => (
        <span className="text-xs text-zinc-500 line-clamp-1 max-w-[200px]">
          {row.original.intentSummary || "—"}
        </span>
      ),
    },
    {
      accessorKey: "durationSeconds",
      header: "Duration",
      cell: ({ row }) => {
        const s = row.original.durationSeconds ?? 0;
        const min = Math.floor(s / 60);
        const sec = s % 60;
        return (
          <span className="font-mono text-xs text-zinc-500">
            {min > 0 ? `${min}m ${sec}s` : `${sec}s`}
          </span>
        );
      },
      size: 90,
    },
    {
      accessorKey: "startedAt",
      header: "Started",
      cell: ({ row }) => (
        <span className="text-xs text-zinc-400">
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
      id: "actions",
      enableHiding: false,
      size: 50,
      cell: ({ row }) => (
        <Link
          href={`/calls/${row.original.id}`}
          className="text-zinc-400 hover:text-emerald-500 transition-colors"
          aria-label="View call details"
        >
          <ExternalLink size={14} />
        </Link>
      ),
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Calls"
          description="All call sessions across the platform"
          actions={
            <div className="flex items-center gap-2">
              {/* Status pills */}
              <div className="flex gap-1 flex-wrap">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatusFilter(s);
                      setPage(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      statusFilter === s
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {s === "" ? "All" : s.replace("_", " ")}
                  </button>
                ))}
              </div>
              {/* Clinic search */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="Filter by clinic…"
                  className="pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-44 transition"
                />
              </div>
            </div>
          }
        />

        <BentoCard>
          {!isLoading && calls.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="No calls found"
              description="No call sessions match the current filters."
            />
          ) : (
            <DataTable
              columns={columns}
              data={calls}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
              emptyMessage="No calls found"
            />
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
