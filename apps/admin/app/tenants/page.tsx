"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Building2, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type Tenant,
  useGetTenantsQuery,
  useUpdateTenantStatusMutation,
} from "@/features/admin/adminApi";

const PAGE_SIZE = 20;

function StatusChangeDialog({
  tenant,
  nextStatus,
  onConfirm,
}: {
  tenant: Tenant;
  nextStatus: string;
  onConfirm: () => void;
}) {
  const actionLabel =
    nextStatus === "suspended"
      ? "Suspend"
      : nextStatus === "archived"
        ? "Archive"
        : "Activate";
  const destructive = nextStatus !== "active";
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            className={destructive ? "text-rose-500 focus:text-rose-500" : ""}
          />
        }
      >
        {actionLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {actionLabel} {tenant.clinicName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {nextStatus === "suspended" &&
              "The clinic will be unable to receive calls until reactivated."}
            {nextStatus === "archived" &&
              "The clinic will be archived. This action is difficult to reverse."}
            {nextStatus === "active" &&
              "The clinic will be reactivated and able to receive calls."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              destructive ? "bg-rose-500 hover:bg-rose-600 text-white" : ""
            }
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function TenantsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [updateStatus] = useUpdateTenantStatusMutation();

  const { data, isLoading } = useGetTenantsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const tenants = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleStatusChange = async (tenantId: string, status: string) => {
    try {
      await updateStatus({ tenantId, status }).unwrap();
      toast.success(`Clinic ${status}`);
    } catch {
      toast.error("Failed to update clinic status");
    }
  };

  const columns: ColumnDef<Tenant>[] = [
    {
      accessorKey: "clinicName",
      header: "Clinic",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/tenants/${row.original.id}`}
            className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors flex items-center gap-1 group"
          >
            {row.original.clinicName}
            <ExternalLink
              size={11}
              className="opacity-0 group-hover:opacity-50 transition-opacity"
            />
          </Link>
          <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
            {row.original.clinicSlug}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "plan",
      header: "Plan",
      cell: ({ row }) => <StatusBadge value={row.original.plan} />,
      size: 120,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
      size: 120,
    },
    {
      accessorKey: "totalCalls",
      header: "Calls",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-500">
          {(row.original.totalCalls ?? 0).toLocaleString()}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: "activeNumbers",
      header: "Numbers",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-500">
          {row.original.activeNumbers ?? 0}
        </span>
      ),
      size: 80,
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
      size: 120,
    },
    {
      id: "actions",
      enableHiding: false,
      size: 60,
      cell: ({ row }) => {
        const t = row.original;
        const nextStatuses = ["active", "suspended", "archived"].filter(
          (s) => s !== t.status,
        );
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-7 w-7" />
              }
            >
              <span className="sr-only">Open menu</span>
              <span className="text-zinc-400 text-lg leading-none">⋯</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/tenants/${t.id}`} />}>
                View details
              </DropdownMenuItem>
              {nextStatuses.map((s) => (
                <StatusChangeDialog
                  key={s}
                  tenant={t}
                  nextStatus={s}
                  onConfirm={() => handleStatusChange(t.id, s)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Clinics"
          description={`${total.toLocaleString()} total clinic${total !== 1 ? "s" : ""}`}
          actions={
            <div className="flex items-center gap-2">
              {/* Status filter */}
              <div className="flex gap-1">
                {["", "active", "suspended", "archived"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatusFilter(s);
                      setPage(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      statusFilter === s
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {/* Search */}
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
                  placeholder="Search clinics…"
                  className="pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-52 transition"
                />
              </div>
            </div>
          }
        />

        <BentoCard>
          {!isLoading && tenants.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No clinics found"
              description={
                search || statusFilter
                  ? "Try adjusting your search or filters."
                  : "No clinics have been created yet."
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={tenants}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
              emptyMessage="No clinics found"
            />
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
