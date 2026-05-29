"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { PhoneCall } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type PhoneNumber,
  useGetPhonePoolQuery,
} from "@/features/admin/adminApi";

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
    id: "capabilities",
    header: "Capabilities",
    cell: ({ row }) => {
      const caps = row.original.capabilities ?? {};
      const list = [caps.voice && "voice", caps.sms && "sms"].filter(Boolean);
      return (
        <span className="text-xs text-muted-foreground">
          {list.length ? list.join(" · ") : "—"}
        </span>
      );
    },
    size: 130,
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
];

export default function PhonePoolPage() {
  const { data, isLoading } = useGetPhonePoolQuery();
  const numbers = data?.data ?? [];
  const active = numbers.filter((n) => n.status === "active").length;
  const unassigned = numbers.filter((n) => !n.tenantId).length;

  return (
    <DashboardShell>
      <div className="space-y-6 animate-fade-up">
        <div className="flex items-center gap-2">
          <PhoneCall className="size-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Phone Pool</h1>
            <p className="text-sm text-muted-foreground">
              Twilio number inventory across the platform.
            </p>
          </div>
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
