"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DashboardShell } from "@/components/dashboard-shell";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetTenantCallsQuery,
  useGetTenantQuery,
  useInvalidateTenantConfigCacheMutation,
  useRunPhiDryRunMutation,
  useUpdateTenantPlanMutation,
  useUpdateTenantStatusMutation,
} from "@/features/admin/adminApi";
import { cn } from "@/lib/utils";

const PLANS = ["starter", "professional", "enterprise"] as const;

function PlanControl({ tenantId, plan }: { tenantId: string; plan: string }) {
  const [updatePlan, { isLoading }] = useUpdateTenantPlanMutation();
  const change = async (next: string) => {
    if (next === plan) return;
    try {
      await updatePlan({ tenantId, plan: next }).unwrap();
      toast.success(`Plan changed to ${next}`);
    } catch {
      toast.error("Failed to change plan");
    }
  };
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
        Plan
      </div>
      <Select value={plan} onValueChange={change} disabled={isLoading}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLANS.map((p) => (
            <SelectItem key={p} value={p} className="capitalize">
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("w-full justify-start gap-2", triggerClassName)}
        >
          {triggerLabel}
        </Button>
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
                ? "bg-rose-500 hover:bg-rose-600 text-primary-foreground"
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
  const { data: callsData } = useGetTenantCallsQuery({
    tenantId: id,
    limit: 5,
  });
  const [updateStatus] = useUpdateTenantStatusMutation();
  const [invalidateCache] = useInvalidateTenantConfigCacheMutation();
  const [runPhiDryRun] = useRunPhiDryRunMutation();

  const recentCalls = callsData?.data ?? [];
  const totalCalls = callsData?.total ?? 0;

  const handleStatusChange = async (status: string, label: string) => {
    try {
      await updateStatus({ tenantId: id, status }).unwrap();
      toast.success(`Clinic ${label}`);
    } catch {
      toast.error("Failed to update clinic status");
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isLoading ? "Loading…" : (tenant?.clinicName ?? "Clinic")}
              </h1>
              <p className="text-sm text-muted-foreground">Tenant detail</p>
            </div>
            {tenant && <StatusBadge value={tenant.status} dot />}
          </div>
          <Link href="/tenants">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft size={13} />
              Back
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={`sk-${i}`} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : !tenant ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground py-8 text-center">
                Clinic not found.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Overview */}
              <Card className="xl:col-span-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Building2 size={14} className="text-muted-foreground" />
                    Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    <InfoItem
                      label="Created"
                      value={timeAgo(tenant.createdAt)}
                    />
                    {tenant.stripeCustomerId && (
                      <InfoItem
                        label="Stripe Customer"
                        value={
                          <code className="text-xs font-mono text-muted-foreground">
                            {tenant.stripeCustomerId.slice(0, 14)}…
                          </code>
                        }
                      />
                    )}
                    {tenant.stripeSubscriptionId && (
                      <InfoItem
                        label="Stripe Sub"
                        value={
                          <code className="text-xs font-mono text-muted-foreground">
                            {tenant.stripeSubscriptionId.slice(0, 14)}…
                          </code>
                        }
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <Card className="xl:col-span-4">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <PlanControl tenantId={tenant.id} plan={tenant.plan} />
                  <div className="h-px bg-border my-1" />
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
                      triggerClassName="text-primary border-primary/20 hover:bg-primary/5"
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
                  <div className="h-px bg-border my-1" />
                  <ConfirmAction
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                      >
                        Invalidate config cache
                      </Button>
                    }
                    title="Invalidate config cache?"
                    description="Forces the AI receptionist to reload this clinic's config on the next call. Use after editing config that isn't taking effect."
                    confirmLabel="Invalidate"
                    successMessage="Config cache invalidated"
                    onConfirm={async () => {
                      await invalidateCache(tenant.id).unwrap();
                    }}
                  />
                  <ConfirmAction
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                      >
                        Run calendar PHI scan
                      </Button>
                    }
                    title="Run a calendar PHI dry-run?"
                    description="Scans the clinic's Google Calendar for exposed patient data and records the findings. This is a read-only dry-run — it does not modify any events."
                    confirmLabel="Run scan"
                    successMessage="PHI dry-run started"
                    onConfirm={async () => {
                      await runPhiDryRun(tenant.id).unwrap();
                    }}
                  />
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
                </CardContent>
              </Card>
            </div>

            {/* Readiness — config completeness + preflight + PHI */}
            {(tenant.latestConfigVersion || tenant.preflight) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck size={14} className="text-muted-foreground" />
                    Readiness
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {tenant.latestConfigVersion && (
                      <>
                        <InfoItem
                          label="Config version"
                          value={
                            <span className="tabular-nums">
                              v{tenant.latestConfigVersion.version}{" "}
                              <StatusBadge
                                value={tenant.latestConfigVersion.status}
                              />
                            </span>
                          }
                        />
                        <InfoItem
                          label="Completeness"
                          value={
                            <span className="tabular-nums">
                              {Math.round(
                                Number(
                                  tenant.latestConfigVersion
                                    .completenessScore ?? 0,
                                ),
                              )}
                              %
                            </span>
                          }
                        />
                      </>
                    )}
                    {tenant.preflight && (
                      <>
                        <InfoItem
                          label="Preflight"
                          value={
                            <StatusBadge
                              value={
                                tenant.preflight.lastPreflightReady
                                  ? "healthy"
                                  : "down"
                              }
                              label={
                                tenant.preflight.lastPreflightReady
                                  ? "ready"
                                  : "blocked"
                              }
                            />
                          }
                        />
                        <InfoItem
                          label="Calendar PHI risk"
                          value={
                            <span
                              className={cn(
                                "tabular-nums",
                                (tenant.preflight
                                  .latestCalendarPhiRiskyEvents ?? 0) > 0 &&
                                  "text-rose-500 font-semibold",
                              )}
                            >
                              {tenant.preflight.latestCalendarPhiRiskyEvents ??
                                0}
                              {" / "}
                              {tenant.preflight.latestCalendarPhiTotalEvents ??
                                0}
                            </span>
                          }
                        />
                      </>
                    )}
                  </div>
                  {tenant.preflight?.lastBlockingIssueCodes &&
                    tenant.preflight.lastBlockingIssueCodes.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {tenant.preflight.lastBlockingIssueCodes.map((code) => (
                          <StatusBadge key={code} value="down" label={code} />
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* Members */}
            {tenant.users && tenant.users.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Users size={14} className="text-muted-foreground" />
                    Members
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Email</th>
                          <th className="px-4 py-2.5 text-left">Name</th>
                          <th className="px-4 py-2.5 text-left">Role</th>
                          <th className="px-4 py-2.5 text-right">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {tenant.users.map((user) => (
                          <tr
                            key={user.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={`/users/${user.id}`}
                                className="font-medium hover:text-primary transition-colors"
                              >
                                {user.email}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {user.displayName || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge value={user.role} />
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                              {timeAgo(user.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Integrations */}
            {tenant.integrations && tenant.integrations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Globe size={14} className="text-muted-foreground" />
                    Integrations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tenant.integrations.map((integration) => (
                      <div
                        key={integration.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30"
                      >
                        <div>
                          <div className="text-sm font-medium capitalize">
                            {integration.provider}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {timeAgo(integration.createdAt)}
                          </div>
                        </div>
                        <StatusBadge value={integration.status} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent calls */}
            {recentCalls.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    Recent Calls
                    {totalCalls > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                        {totalCalls.toLocaleString()} total
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {recentCalls.map((call) => (
                      <div
                        key={call.id}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <StatusBadge value={call.status} dot />
                          <span className="text-xs font-mono text-muted-foreground">
                            {call.callerNumber || "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {call.durationSeconds != null && (
                            <span className="text-xs text-muted-foreground">
                              {Math.floor(call.durationSeconds / 60)}m{" "}
                              {call.durationSeconds % 60}s
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(call.startedAt)}
                          </span>
                          <Link
                            href={`/calls/${call.id}`}
                            className="text-muted-foreground hover:text-primary transition-colors"
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
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      View all calls →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
