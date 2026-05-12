"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Search, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { type AdminUser, useGetUsersQuery } from "@/features/admin/adminApi";

const PAGE_SIZE = 25;

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useGetUsersQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: search || undefined,
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
            className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors flex items-center gap-1 group"
          >
            {row.original.email}
            <ExternalLink
              size={11}
              className="opacity-0 group-hover:opacity-50 transition-opacity"
            />
          </Link>
          {row.original.displayName && (
            <div className="text-[10px] text-zinc-400 mt-0.5">
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
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            {row.original.clinicName}
          </Link>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-xs text-zinc-400">
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
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description={`${total.toLocaleString()} user account${total !== 1 ? "s" : ""}`}
          actions={
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search by email…"
                className="pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-56 transition"
              />
            </div>
          }
        />

        <BentoCard>
          {!isLoading && users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={
                search
                  ? "Try a different search term."
                  : "No user accounts exist yet."
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={users}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
              emptyMessage="No users found"
            />
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
