"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { type AdminUser, useGetUsersQuery } from "@/features/admin/adminApi";

const PAGE_SIZE = 25;

export default function UsersPage() {
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));

  const { data, isLoading } = useGetUsersQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: q || undefined,
  });

  const users = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/users/${row.original.id}`}
            className="font-medium hover:text-primary transition-colors flex items-center gap-1 group"
          >
            {row.original.email}
            <ExternalLink
              size={11}
              className="opacity-0 group-hover:opacity-50 transition-opacity"
            />
          </Link>
          {row.original.displayName && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {row.original.displayName}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <StatusBadge value={row.original.role} />,
      size: 140,
    },
    {
      accessorKey: "clinicName",
      header: "Clinic",
      cell: ({ row }) =>
        row.original.clinicName ? (
          <Link
            href={`/tenants/${row.original.tenantId}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {row.original.clinicName}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.createdAt), {
            addSuffix: true,
          })}
        </span>
      ),
      size: 140,
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-center">
          <h1 className="text-lg font-semibold">
            Users{" "}
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({total.toLocaleString()})
              </span>
            )}
          </h1>
        </div>

        <DataTable
          columns={columns}
          data={users}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage={
            q ? "No users match the search." : "No user accounts found."
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
