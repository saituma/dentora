"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
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
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withDefault(""),
  );
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));

  const { data, isLoading } = useGetCallsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: status || undefined,
  });

  const allCalls = data?.data ?? [];
  const calls = q
    ? allCalls.filter((c) =>
        c.clinicName?.toLowerCase().includes(q.toLowerCase()),
      )
    : allCalls;
  const total = data?.total ?? 0;

  const columns: ColumnDef<CallSession>[] = [
    {
      accessorKey: "clinicName",
      header: "Clinic",
      cell: ({ row }) => (
        <span className="font-medium truncate max-w-[160px] block">
          {row.original.clinicName || "Unknown"}
        </span>
      ),
    },
    {
      accessorKey: "callerNumber",
      header: "Caller",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
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
        <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
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
          <span className="font-mono text-xs text-muted-foreground">
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
        <span className="text-xs text-muted-foreground">
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
          className="text-muted-foreground hover:text-primary transition-colors"
          aria-label="View call details"
        >
          <ExternalLink size={14} />
        </Link>
      ),
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">
            Calls{" "}
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({total.toLocaleString()})
              </span>
            )}
          </h1>
          <div className="ml-auto flex gap-1 flex-wrap">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s);
                  setPage(0);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  status === s
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s === "" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={calls}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage="No calls match the current filters."
          searchValue={q}
          onSearchChange={(v) => {
            setQ(v);
            setPage(0);
          }}
        />
      </div>
    </DashboardShell>
  );
}
