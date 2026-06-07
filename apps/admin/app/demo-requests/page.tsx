"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import {
  type DemoRequest,
  useGetDemoRequestsQuery,
} from "@/features/admin/adminApi";

const PAGE_SIZE = 20;

export default function DemoRequestsPage() {
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));

  const { data, isLoading } = useGetDemoRequestsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: q || undefined,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: ColumnDef<DemoRequest>[] = [
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.fullName}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <a
          href={`mailto:${row.original.email}`}
          className="text-primary hover:underline"
        >
          {row.original.email}
        </a>
      ),
    },
    {
      accessorKey: "phoneE164",
      header: "Phone",
      cell: ({ row }) => (
        <a
          href={`tel:${row.original.phoneE164}`}
          className="font-mono text-xs text-muted-foreground hover:text-primary"
        >
          {row.original.phoneE164}
        </a>
      ),
      size: 160,
    },
    {
      accessorKey: "phoneCountry",
      header: "Country",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.phoneCountry}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: "message",
      header: "Message",
      cell: ({ row }) => (
        <p
          className="max-w-[300px] truncate text-xs text-muted-foreground"
          title={row.original.message}
        >
          {row.original.message}
        </p>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Submitted",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.createdAt), {
            addSuffix: true,
          })}
        </span>
      ),
      size: 120,
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">
          Demo Requests{" "}
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({total.toLocaleString()})
            </span>
          )}
        </h1>

        <DataTable
          columns={columns}
          data={rows}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage={
            q ? "No demo requests match the search." : "No demo requests yet."
          }
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
