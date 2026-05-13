"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import {
  type AuditEntry,
  useGetAuditLogQuery,
} from "@/features/admin/adminApi";

const PAGE_SIZE = 50;
const ACTOR_TYPES = ["", "admin", "user", "system", "integration"];

export default function AuditPage() {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [actorType, setActorType] = useQueryState(
    "actor",
    parseAsString.withDefault(""),
  );
  const [tenantId] = useQueryState("tenant", parseAsString.withDefault(""));

  const { data, isLoading } = useGetAuditLogQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    action: q || undefined,
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
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
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
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-[120px]">
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
          <span className="text-xs text-muted-foreground">
            {row.original.entityType || "—"}
          </span>
          {row.original.entityId && (
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-[100px]">
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
          return <span className="text-muted-foreground">—</span>;
        const ip = meta.ip as string | undefined;
        const corrId = meta.correlationId as string | undefined;
        return (
          <div className="space-y-0.5">
            {ip && (
              <div className="text-[10px] font-mono text-muted-foreground">
                {ip}
              </div>
            )}
            {corrId && (
              <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
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
          className="text-xs text-muted-foreground whitespace-nowrap"
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
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold">Audit Log</h1>
          <div className="ml-auto flex gap-1">
            {ACTOR_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setActorType(t);
                  setPage(0);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  actorType === t
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t === "" ? "All" : t}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={entries}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage="No audit entries match the current filters."
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
