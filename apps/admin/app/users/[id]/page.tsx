"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, ScrollText, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetAuditLogQuery,
  useGetUserQuery,
} from "@/features/admin/adminApi";

function timeAgo(dateStr?: string) {
  if (!dateStr) return "—";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading } = useGetUserQuery(id);
  const { data: auditData, isLoading: auditLoading } = useGetAuditLogQuery({
    actorId: id,
    limit: 20,
  });
  const auditEntries = auditData?.data ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isLoading ? "Loading…" : (user?.email ?? "User")}
              </h1>
              <p className="text-sm text-muted-foreground">User detail</p>
            </div>
            {user && <StatusBadge value={user.role} />}
          </div>
          <Link href="/users">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft size={13} />
              Back
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : !user ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground py-8 text-center">
                User not found.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Profile */}
              <Card className="xl:col-span-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <User size={14} className="text-muted-foreground" />
                    Profile
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <InfoItem label="Email" value={user.email} />
                    <InfoItem
                      label="Display Name"
                      value={user.displayName || "—"}
                    />
                    <InfoItem
                      label="Role"
                      value={<StatusBadge value={user.role} />}
                    />
                    <InfoItem
                      label="Clinic"
                      value={
                        user.tenantId ? (
                          <Link
                            href={`/tenants/${user.tenantId}`}
                            className="text-emerald-500 hover:underline"
                          >
                            {user.clinicName || user.tenantId.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )
                      }
                    />
                    <InfoItem
                      label="Member Since"
                      value={timeAgo(user.createdAt)}
                    />
                    <InfoItem
                      label="User ID"
                      value={
                        <code className="text-xs font-mono text-muted-foreground">
                          {user.id.slice(0, 8)}…
                        </code>
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Stats */}
              <Card className="xl:col-span-4">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    At a Glance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">
                      Joined
                    </span>
                    <span className="text-xs font-mono">
                      {user.createdAt
                        ? format(new Date(user.createdAt), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">
                      Audit events (recent)
                    </span>
                    <span className="text-xs font-mono">
                      {auditEntries.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">Role</span>
                    <StatusBadge value={user.role} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent audit activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <ScrollText size={14} className="text-muted-foreground" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton
                        key={`sk-${i}`}
                        className="h-10 w-full rounded-xl"
                      />
                    ))}
                  </div>
                ) : auditEntries.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <ScrollText size={20} />
                    <p className="text-sm font-medium">No activity</p>
                    <p className="text-xs">
                      No audit events found for this user.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-hidden rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2.5 text-left">Action</th>
                            <th className="px-4 py-2.5 text-left">Entity</th>
                            <th className="px-4 py-2.5 text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {auditEntries.map((entry) => (
                            <tr
                              key={entry.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {entry.action}
                                </code>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {entry.entityType || "—"}
                                {entry.entityId && (
                                  <span className="ml-1.5 font-mono">
                                    {entry.entityId.slice(0, 8)}…
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                                {format(
                                  new Date(entry.createdAt),
                                  "MMM d, HH:mm:ss",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {auditEntries.length >= 20 && (
                      <div className="mt-3 text-right">
                        <Link
                          href={`/audit?actorId=${user.id}`}
                          className="text-xs text-muted-foreground hover:text-emerald-500 transition-colors"
                        >
                          View full audit log →
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
