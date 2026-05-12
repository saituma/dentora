"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, ScrollText, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
      <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 mb-1">
        {label}
      </div>
      <div className="text-sm text-zinc-900 dark:text-zinc-100">{value}</div>
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
        <PageHeader
          title={isLoading ? "Loading…" : (user?.email ?? "User")}
          breadcrumbs={[
            { label: "Users", href: "/users" },
            { label: user?.email ?? id.slice(0, 8) },
          ]}
          badge={user ? <StatusBadge value={user.role} /> : undefined}
          actions={
            <Link href="/users">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft size={13} />
                Back
              </Button>
            </Link>
          }
        />

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-[2rem]" />
            <Skeleton className="h-64 w-full rounded-[2rem]" />
          </div>
        ) : !user ? (
          <BentoCard>
            <p className="text-sm text-zinc-500 py-8 text-center">
              User not found.
            </p>
          </BentoCard>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Profile */}
              <BentoCard
                className="xl:col-span-8"
                title="Profile"
                icon={<User size={14} />}
              >
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-4">
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
                      <code className="text-xs font-mono text-zinc-400">
                        {user.id.slice(0, 8)}…
                      </code>
                    }
                  />
                </div>
              </BentoCard>

              {/* Stats */}
              <BentoCard className="xl:col-span-4" title="At a Glance">
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-xs text-zinc-500">Joined</span>
                    <span className="text-xs font-mono text-zinc-900 dark:text-zinc-100">
                      {user.createdAt
                        ? format(new Date(user.createdAt), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-xs text-zinc-500">
                      Audit events (recent)
                    </span>
                    <span className="text-xs font-mono text-zinc-900 dark:text-zinc-100">
                      {auditEntries.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-xs text-zinc-500">Role</span>
                    <StatusBadge value={user.role} />
                  </div>
                </div>
              </BentoCard>
            </div>

            {/* Recent audit activity */}
            <BentoCard title="Recent Activity" icon={<ScrollText size={14} />}>
              {auditLoading ? (
                <div className="mt-2 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton
                      key={`sk-${i}`}
                      className="h-10 w-full rounded-xl"
                    />
                  ))}
                </div>
              ) : auditEntries.length === 0 ? (
                <EmptyState
                  icon={ScrollText}
                  title="No activity"
                  description="No audit events found for this user."
                />
              ) : (
                <>
                  <div className="mt-2 overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs font-medium text-zinc-500">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Action</th>
                          <th className="px-4 py-2.5 text-left">Entity</th>
                          <th className="px-4 py-2.5 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                        {auditEntries.map((entry) => (
                          <tr
                            key={entry.id}
                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <code className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                                {entry.action}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-500">
                              {entry.entityType || "—"}
                              {entry.entityId && (
                                <span className="ml-1.5 font-mono text-zinc-400">
                                  {entry.entityId.slice(0, 8)}…
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-zinc-400 whitespace-nowrap">
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
                        className="text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
                      >
                        View full audit log →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </BentoCard>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
