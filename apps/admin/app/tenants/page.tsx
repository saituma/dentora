"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
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
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className={destructive ? "text-rose-500 focus:text-rose-500" : ""}
        >
          {actionLabel}
        </DropdownMenuItem>
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
              destructive
                ? "bg-rose-500 hover:bg-rose-600 text-primary-foreground"
                : ""
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
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withDefault(""),
  );
  const [updateStatus] = useUpdateTenantStatusMutation();

  const { data, isLoading } = useGetTenantsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: q || undefined,
    status: status || undefined,
  });

  const tenants = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleStatusChange = async (tenantId: string, nextStatus: string) => {
    try {
      await updateStatus({ tenantId, status: nextStatus }).unwrap();
      toast.success(`Clinic ${nextStatus}`);
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
            className="font-medium hover:text-primary transition-colors flex items-center gap-1 group"
          >
            {row.original.clinicName}
            <ExternalLink
              size={11}
              className="opacity-0 group-hover:opacity-50 transition-opacity"
            />
          </Link>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
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
        <span className="font-mono text-xs text-muted-foreground">
          {(row.original.totalCalls ?? 0).toLocaleString()}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: "activeNumbers",
      header: "Numbers",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.activeNumbers ?? 0}
        </span>
      ),
      size: 80,
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
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <span className="sr-only">Open menu</span>
                <span className="text-muted-foreground text-lg leading-none">
                  ⋯
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/tenants/${t.id}`}>View details</Link>
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
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">
            Clinics{" "}
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({total.toLocaleString()})
              </span>
            )}
          </h1>
          <div className="ml-auto flex gap-1">
            {["", "active", "suspended", "archived"].map((s) => (
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
                {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={tenants}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage={
            q || status ? "No clinics match the filters." : "No clinics found."
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
