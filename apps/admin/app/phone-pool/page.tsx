"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, PhoneCall, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type PhoneNumber,
  useAssignPhoneNumberMutation,
  useBuyPhoneNumberMutation,
  useGetPhonePoolQuery,
  useGetTenantsQuery,
  useReleasePhoneNumberMutation,
} from "@/features/admin/adminApi";

function PhoneActions({ number }: { number: PhoneNumber }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [tenantId, setTenantId] = useState<string>("");
  const { data: tenants } = useGetTenantsQuery(
    { limit: 200 },
    { skip: !assignOpen },
  );
  const [assign, { isLoading: assigning }] = useAssignPhoneNumberMutation();
  const [release] = useReleasePhoneNumberMutation();

  const doAssign = async () => {
    if (!tenantId) return;
    try {
      await assign({ numberId: number.id, tenantId }).unwrap();
      toast.success("Number assigned");
      setAssignOpen(false);
      setTenantId("");
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error ?? "Assign failed",
      );
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAssignOpen(true)}>
            Assign to clinic…
          </DropdownMenuItem>
          <ConfirmAction
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-rose-500 focus:text-rose-500"
              >
                Release number
              </DropdownMenuItem>
            }
            title="Release this number?"
            description={
              <>
                Releasing{" "}
                <span className="font-mono">{number.phoneNumber}</span> removes
                it from the active pool and stops routing calls. This is hard to
                reverse.
              </>
            }
            confirmLabel="Release"
            destructive
            confirmText={number.phoneNumber}
            successMessage="Number released"
            onConfirm={async () => {
              await release(number.id).unwrap();
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign number</DialogTitle>
            <DialogDescription>
              Route <span className="font-mono">{number.phoneNumber}</span> to a
              clinic. Each clinic can hold one active number.
            </DialogDescription>
          </DialogHeader>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a clinic…" />
            </SelectTrigger>
            <SelectContent>
              {(tenants?.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.clinicName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAssignOpen(false)}
              disabled={assigning}
            >
              Cancel
            </Button>
            <Button onClick={doAssign} disabled={!tenantId || assigning}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const columns: ColumnDef<PhoneNumber>[] = [
  {
    accessorKey: "phoneNumber",
    header: "Number",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-medium">
        {row.original.phoneNumber}
      </span>
    ),
  },
  {
    accessorKey: "clinicName",
    header: "Assigned clinic",
    cell: ({ row }) =>
      row.original.tenantId ? (
        <Link
          href={`/tenants/${row.original.tenantId}`}
          className="font-medium hover:text-primary transition-colors"
        >
          {row.original.clinicName || row.original.tenantId.slice(0, 8)}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">Unassigned</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
    size: 110,
  },
  {
    accessorKey: "createdAt",
    header: "Provisioned",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.createdAt
          ? formatDistanceToNow(new Date(row.original.createdAt), {
              addSuffix: true,
            })
          : "—"}
      </span>
    ),
    size: 140,
  },
  {
    id: "actions",
    enableHiding: false,
    size: 50,
    cell: ({ row }) => <PhoneActions number={row.original} />,
  },
];

export default function PhonePoolPage() {
  const { data, isLoading } = useGetPhonePoolQuery();
  const [buy, { isLoading: buying }] = useBuyPhoneNumberMutation();
  const numbers = data?.data ?? [];
  const active = numbers.filter((n) => n.status === "active").length;
  const unassigned = numbers.filter((n) => !n.tenantId).length;

  return (
    <DashboardShell>
      <div className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PhoneCall className="size-5 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Phone Pool</h1>
              <p className="text-sm text-muted-foreground">
                Twilio number inventory across the platform.
              </p>
            </div>
          </div>
          <ConfirmAction
            trigger={
              <Button size="sm" className="gap-1.5" disabled={buying}>
                <Plus className="size-4" />
                Buy number
              </Button>
            }
            title="Buy a new Twilio number?"
            description={
              <>
                This provisions a new phone number from Twilio and{" "}
                <span className="font-semibold text-foreground">
                  charges your Twilio account real money
                </span>{" "}
                (≈ £1/month + usage). The number lands in the pool unassigned.
              </>
            }
            confirmLabel="Buy number"
            confirmText="BUY"
            successMessage="Number purchased"
            onConfirm={async () => {
              await buy({}).unwrap();
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "Total numbers", value: numbers.length },
            { title: "Active", value: active },
            { title: "Unassigned", value: unassigned },
          ].map(({ title, value }) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {isLoading ? "—" : value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Numbers</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <DataTable
              columns={columns}
              data={numbers}
              isLoading={isLoading}
              emptyMessage="No numbers in the pool."
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
