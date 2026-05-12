"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Building2, ExternalLink, Globe, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { toast } from "sonner";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetCallsQuery,
  useGetTenantQuery,
  useUpdateTenantStatusMutation,
} from "@/features/admin/adminApi";
import { cn } from "@/lib/utils";

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

function StatusActionDialog({
  triggerLabel,
  triggerClassName,
  title,
  description,
  actionLabel,
  destructive,
  onConfirm,
}: {
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("w-full justify-start gap-2", triggerClassName)}
          />
        }
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              destructive
                ? "bg-rose-500 hover:bg-rose-600 text-white"
                : undefined
            }
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tenant, isLoading } = useGetTenantQuery(id);
  const { data: callsData } = useGetCallsQuery({ tenantId: id, limit: 5 });
  const [updateStatus] = useUpdateTenantStatusMutation();

  const recentCalls = callsData?.data ?? [];

  const handleStatusChange = async (status: string, label: string) => {
    try {
      await updateStatus({ tenantId: id, status }).unwrap();
      toast.success(`Clinic ${label}`);
    } catch {
      toast.error(`Failed to update clinic status`);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title={isLoading ? "Loading…" : (tenant?.clinicName ?? "Clinic")}
          breadcrumbs={[
            { label: "Tenants", href: "/tenants" },
            { label: tenant?.clinicName ?? id.slice(0, 8) },
          ]}
          badge={tenant ? <StatusBadge value={tenant.status} dot /> : undefined}
          actions={
            <Link href="/tenants">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft size={13} />
                Back
              </Button>
            </Link>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={`sk-${i}`}
                className="h-40 w-full rounded-[2rem]"
              />
            ))}
          </div>
        ) : !tenant ? (
          <BentoCard>
            <p className="text-sm text-zinc-500 py-8 text-center">
              Clinic not found.
            </p>
          </BentoCard>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Overview */}
              <BentoCard
                className="xl:col-span-8"
                title="Overview"
                icon={<Building2 size={14} />}
              >
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InfoItem
                    label="Plan"
                    value={<StatusBadge value={tenant.plan} />}
                  />
                  <InfoItem
                    label="Status"
                    value={<StatusBadge value={tenant.status} dot />}
                  />
                  <InfoItem
                    label="Slug"
                    value={
                      <code className="text-xs font-mono">
                        {tenant.clinicSlug}
                      </code>
                    }
                  />
                  <InfoItem
                    label="Total Calls"
                    value={(tenant.totalCalls ?? 0).toLocaleString()}
                  />
                  <InfoItem
                    label="Phone Numbers"
                    value={(tenant.activeNumbers ?? 0).toString()}
                  />
                  <InfoItem label="Created" value={timeAgo(tenant.createdAt)} />
                  {tenant.stripeCustomerId && (
                    <InfoItem
                      label="Stripe Customer"
                      value={
                        <code className="text-xs font-mono text-zinc-400">
                          {tenant.stripeCustomerId.slice(0, 14)}…
                        </code>
                      }
                    />
                  )}
                  {tenant.stripeSubscriptionId && (
                    <InfoItem
                      label="Stripe Sub"
                      value={
                        <code className="text-xs font-mono text-zinc-400">
                          {tenant.stripeSubscriptionId.slice(0, 14)}…
                        </code>
                      }
                    />
                  )}
                </div>
              </BentoCard>

              {/* Actions */}
              <BentoCard className="xl:col-span-4" title="Actions">
                <div className="mt-2 space-y-2">
                  {tenant.status !== "suspended" && (
                    <StatusActionDialog
                      triggerLabel="Suspend clinic"
                      triggerClassName="text-amber-500 border-amber-500/20 hover:bg-amber-500/5"
                      title="Suspend this clinic?"
                      description="The clinic will lose access immediately."
                      actionLabel="Suspend"
                      destructive
                      onConfirm={() =>
                        handleStatusChange("suspended", "suspended")
                      }
                    />
                  )}
                  {tenant.status === "suspended" && (
                    <StatusActionDialog
                      triggerLabel="Reactivate clinic"
                      triggerClassName="text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/5"
                      title="Reactivate this clinic?"
                      description="The clinic will regain full access to the platform."
                      actionLabel="Reactivate"
                      onConfirm={() =>
                        handleStatusChange("active", "reactivated")
                      }
                    />
                  )}
                  {tenant.status !== "archived" && (
                    <StatusActionDialog
                      triggerLabel="Archive clinic"
                      triggerClassName="text-rose-500 border-rose-500/20 hover:bg-rose-500/5"
                      title="Archive this clinic?"
                      description="The clinic will be permanently deactivated. This is difficult to reverse."
                      actionLabel="Archive"
                      destructive
                      onConfirm={() =>
                        handleStatusChange("archived", "archived")
                      }
                    />
                  )}
                  <Link href={`/calls?tenantId=${tenant.id}`} className="block">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2"
                    >
                      <ExternalLink size={12} />
                      View all calls
                    </Button>
                  </Link>
                </div>
              </BentoCard>
            </div>

            {/* Members */}
            {tenant.users && tenant.users.length > 0 && (
              <BentoCard title="Members" icon={<Users size={14} />}>
                <div className="mt-2 overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs font-medium text-zinc-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Email</th>
                        <th className="px-4 py-2.5 text-left">Name</th>
                        <th className="px-4 py-2.5 text-left">Role</th>
                        <th className="px-4 py-2.5 text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {tenant.users.map((user) => (
                        <tr
                          key={user.id}
                          className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/users/${user.id}`}
                              className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-emerald-500 transition-colors"
                            >
                              {user.email}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-zinc-500">
                            {user.displayName || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge value={user.role} />
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-zinc-400">
                            {timeAgo(user.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </BentoCard>
            )}

            {/* Integrations */}
            {tenant.integrations && tenant.integrations.length > 0 && (
              <BentoCard title="Integrations" icon={<Globe size={14} />}>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tenant.integrations.map((integration) => (
                    <div
                      key={integration.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                          {integration.provider}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {timeAgo(integration.createdAt)}
                        </div>
                      </div>
                      <StatusBadge value={integration.status} />
                    </div>
                  ))}
                </div>
              </BentoCard>
            )}

            {/* Recent calls */}
            {recentCalls.length > 0 && (
              <BentoCard title="Recent Calls">
                <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {recentCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <StatusBadge value={call.status} dot />
                        <span className="text-xs font-mono text-zinc-400">
                          {call.callerNumber || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {call.durationSeconds != null && (
                          <span className="text-xs text-zinc-400">
                            {Math.floor(call.durationSeconds / 60)}m{" "}
                            {call.durationSeconds % 60}s
                          </span>
                        )}
                        <span className="text-xs text-zinc-400">
                          {timeAgo(call.startedAt)}
                        </span>
                        <Link
                          href={`/calls/${call.id}`}
                          className="text-zinc-400 hover:text-emerald-500 transition-colors"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-right">
                  <Link
                    href={`/calls?tenantId=${tenant.id}`}
                    className="text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
                  >
                    View all calls →
                  </Link>
                </div>
              </BentoCard>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
