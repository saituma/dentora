"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Mail,
  ScrollText,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type React from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
  type AdminUserDetail,
  type TenantSummary,
  useDeleteUserMutation,
  useGetAuditLogQuery,
  useGetUserQuery,
  useImpersonateUserMutation,
  useResetUserMfaMutation,
  useRevokeUserSessionsMutation,
  useSendPasswordResetMutation,
  useUpdateUserRoleMutation,
  useVerifyUserEmailMutation,
} from "@/features/admin/adminApi";

const TENANT_ROLES = ["owner", "admin", "manager", "viewer"] as const;

function UserActions({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const tenant = user.tenant;
  const [updateRole, { isLoading: roleBusy }] = useUpdateUserRoleMutation();
  const [resetMfa] = useResetUserMfaMutation();
  const [verifyEmail] = useVerifyUserEmailMutation();
  const [revokeSessions] = useRevokeUserSessionsMutation();
  const [sendReset] = useSendPasswordResetMutation();
  const [impersonate] = useImpersonateUserMutation();
  const [deleteUser] = useDeleteUserMutation();

  const changeRole = async (role: string) => {
    if (!tenant || role === tenant.tenantRole) return;
    try {
      await updateRole({ userId: user.id, tenantId: tenant.id, role }).unwrap();
      toast.success(`Role changed to ${role}`);
    } catch {
      toast.error("Failed to change role");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tenant && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Clinic role
            </div>
            <Select
              value={tenant.tenantRole}
              onValueChange={changeRole}
              disabled={roleBusy}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENANT_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!user.emailVerified && (
          <ConfirmAction
            trigger={
              <Button variant="outline" size="sm" className="w-full text-xs">
                Verify email
              </Button>
            }
            title="Mark email as verified?"
            description="Manually verifies this user's email without the OTP flow."
            confirmLabel="Verify"
            successMessage="Email verified"
            onConfirm={async () => {
              await verifyEmail(user.id).unwrap();
            }}
          />
        )}

        {user.mfaEnabled && (
          <ConfirmAction
            trigger={
              <Button variant="outline" size="sm" className="w-full text-xs">
                Reset MFA
              </Button>
            }
            title="Reset this user's MFA?"
            description="Clears their authenticator and recovery codes so they can re-enrol. Use when staff are locked out."
            confirmLabel="Reset MFA"
            successMessage="MFA reset"
            onConfirm={async () => {
              await resetMfa(user.id).unwrap();
            }}
          />
        )}

        <ConfirmAction
          trigger={
            <Button variant="outline" size="sm" className="w-full text-xs">
              Send password reset
            </Button>
          }
          title="Send a password-reset email?"
          description={`Emails a reset link to ${user.email} (valid 1 hour).`}
          confirmLabel="Send"
          successMessage="Reset email sent"
          onConfirm={async () => {
            await sendReset(user.id).unwrap();
          }}
        />

        <ConfirmAction
          trigger={
            <Button variant="outline" size="sm" className="w-full text-xs">
              Force logout
            </Button>
          }
          title="Revoke all sessions?"
          description="Logs this user out everywhere by deleting their refresh sessions. They'll need to log in again."
          confirmLabel="Force logout"
          successMessage="Sessions revoked"
          onConfirm={async () => {
            await revokeSessions(user.id).unwrap();
          }}
        />

        {tenant && (
          <ConfirmAction
            trigger={
              <Button variant="outline" size="sm" className="w-full text-xs">
                Impersonate
              </Button>
            }
            title="Impersonate this user?"
            description="Generates a short-lived token to view the app as this clinic user (you'll see their patient data). This is logged to the audit trail."
            confirmLabel="Generate token"
            onConfirm={async () => {
              const res = await impersonate(user.id).unwrap();
              await navigator.clipboard?.writeText(res.token).catch(() => {});
              toast.success("Impersonation token copied to clipboard", {
                description:
                  "Short-lived. Use it in the client app to view as this user.",
              });
            }}
          />
        )}

        <ConfirmAction
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs text-rose-500 border-rose-500/30 hover:bg-rose-500/5"
            >
              Delete account
            </Button>
          }
          title="Permanently delete this user?"
          description={
            <>
              This GDPR-erases <span className="font-medium">{user.email}</span>{" "}
              — sessions, logins, API keys and memberships are removed. This{" "}
              <span className="font-semibold text-foreground">
                cannot be undone.
              </span>
            </>
          }
          confirmLabel="Delete account"
          destructive
          confirmText={user.email}
          successMessage="User deleted"
          onConfirm={async () => {
            await deleteUser(user.id).unwrap();
            router.push("/users");
          }}
        />
      </CardContent>
    </Card>
  );
}

function timeAgo(dateStr?: string | null) {
  if (!dateStr) return "—";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

function fmt(dateStr?: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "MMM d, yyyy");
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

function ScoreBadge({ score }: { score?: string | null }) {
  const n = Number(score ?? 0);
  const color =
    n >= 80
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : n >= 50
        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
        : "bg-red-500/10 text-red-500 border-red-500/20";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono ${color}`}
    >
      {n.toFixed(0)}%
    </span>
  );
}

function ClinicSection({ tenant }: { tenant: TenantSummary }) {
  const profile = tenant.clinicProfile;
  const config = tenant.latestConfigVersion;
  const preflight = tenant.preflight;

  return (
    <div className="space-y-5">
      {/* Clinic identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Building2 size={14} className="text-muted-foreground" />
            Clinic
            <Link
              href={`/tenants/${tenant.id}`}
              className="ml-auto text-xs text-primary hover:underline font-normal"
            >
              View tenant →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem label="Clinic Name" value={tenant.clinicName} />
            <InfoItem label="Slug" value={tenant.clinicSlug} />
            <InfoItem
              label="Plan"
              value={<StatusBadge value={tenant.plan} />}
            />
            <InfoItem
              label="Status"
              value={<StatusBadge value={tenant.status} />}
            />
            <InfoItem
              label="User Role in Clinic"
              value={<StatusBadge value={tenant.tenantRole} />}
            />
            <InfoItem label="Tenant Since" value={fmt(tenant.createdAt)} />
            {tenant.stripeCustomerId && (
              <InfoItem
                label="Stripe Customer"
                value={
                  <code className="text-xs font-mono text-muted-foreground">
                    {tenant.stripeCustomerId}
                  </code>
                }
              />
            )}
            {tenant.stripeSubscriptionId && (
              <InfoItem
                label="Subscription"
                value={
                  <code className="text-xs font-mono text-muted-foreground">
                    {tenant.stripeSubscriptionId}
                  </code>
                }
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Clinic profile / onboarding */}
      {profile ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Onboarding — Clinic Profile
              <span className="ml-2">
                <StatusBadge value={profile.status} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoItem
                label="Legal Entity"
                value={profile.legalEntityName || "—"}
              />
              <InfoItem label="Timezone" value={profile.timezone || "—"} />
              <InfoItem
                label="Primary Phone"
                value={profile.primaryPhone || "—"}
              />
              <InfoItem
                label="Support Email"
                value={profile.supportEmail || "—"}
              />
              <InfoItem label="Website" value={profile.website || "—"} />
              <InfoItem label="Address" value={profile.address || "—"} />
              {profile.description && (
                <div className="col-span-2 md:col-span-3">
                  <InfoItem label="Description" value={profile.description} />
                </div>
              )}
            </div>

            {Array.isArray(profile.specialties) &&
              profile.specialties.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                    Specialties
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(profile.specialties as string[]).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

            {Array.isArray(profile.staffMembers) &&
              profile.staffMembers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                    Staff ({profile.staffMembers.length})
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(
                          profile.staffMembers as Array<{
                            name?: string;
                            role?: string;
                          }>
                        ).map((s, i) => (
                          <tr
                            key={`staff-${i}`}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-xs">
                              {s.name || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {s.role || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {profile.businessHours && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                  Business Hours
                </div>
                <pre className="text-xs font-mono bg-muted/50 p-3 rounded-xl overflow-x-auto border border-border">
                  {JSON.stringify(profile.businessHours, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center py-4">
              No clinic profile created yet — onboarding not started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Config version + preflight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Config Version
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {config ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">Version</span>
                  <span className="text-xs font-mono">v{config.version}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <StatusBadge value={config.status} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">
                    Completeness
                  </span>
                  <ScoreBadge score={config.completenessScore} />
                </div>
                {config.publishedAt && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">
                      Published
                    </span>
                    <span className="text-xs font-mono">
                      {fmt(config.publishedAt)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No config versions yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Pilot Preflight
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {preflight ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">Ready</span>
                  {preflight.lastPreflightReady ? (
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  ) : (
                    <XCircle size={14} className="text-red-500" />
                  )}
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">
                    Last checked
                  </span>
                  <span className="text-xs font-mono">
                    {timeAgo(preflight.lastPreflightCheckedAt)}
                  </span>
                </div>
                {preflight.lastBlockingIssueCodes?.length > 0 && (
                  <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                    <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1.5">
                      Blocking Issues
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preflight.lastBlockingIssueCodes.map((c) => (
                        <code
                          key={c}
                          className="text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded"
                        >
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {preflight.lastWarningCodes?.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1.5">
                      Warnings
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preflight.lastWarningCodes.map((c) => (
                        <code
                          key={c}
                          className="text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded"
                        >
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {preflight.latestCalendarPhiTotalEvents != null && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">
                      Calendar PHI scan
                    </span>
                    <span className="text-xs font-mono">
                      {preflight.latestCalendarPhiRiskyEvents} /{" "}
                      {preflight.latestCalendarPhiTotalEvents} risky
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No preflight data yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: userData, isLoading } = useGetUserQuery(id);
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
                {isLoading ? "Loading…" : (userData?.email ?? "User")}
              </h1>
              <p className="text-sm text-muted-foreground">User detail</p>
            </div>
            {userData && <StatusBadge value={userData.role} />}
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
        ) : !userData ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground py-8 text-center">
                User not found.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* User profile */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <Card className="xl:col-span-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <User size={14} className="text-muted-foreground" />
                    Profile
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <InfoItem label="Email" value={userData.email} />
                    <InfoItem
                      label="Display Name"
                      value={userData.displayName || "—"}
                    />
                    <InfoItem
                      label="Platform Role"
                      value={<StatusBadge value={userData.role} />}
                    />
                    <InfoItem
                      label="Email Verified"
                      value={
                        userData.emailVerified ? (
                          <CheckCircle2
                            size={14}
                            className="text-emerald-500"
                          />
                        ) : (
                          <XCircle size={14} className="text-red-400" />
                        )
                      }
                    />
                    <InfoItem
                      label="MFA"
                      value={
                        userData.mfaEnabled ? (
                          <span className="flex items-center gap-1 text-emerald-500 text-xs">
                            <ShieldCheck size={13} /> Enabled
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Disabled
                          </span>
                        )
                      }
                    />
                    <InfoItem
                      label="User ID"
                      value={
                        <code className="text-xs font-mono text-muted-foreground">
                          {userData.id.slice(0, 8)}…
                        </code>
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="xl:col-span-4">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    At a Glance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock size={11} /> Joined
                    </span>
                    <span className="text-xs font-mono">
                      {fmt(userData.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Mail size={11} /> Email
                    </span>
                    <span className="text-xs">
                      {userData.emailVerified ? (
                        <span className="text-emerald-500">Verified</span>
                      ) : (
                        <span className="text-amber-500">Unverified</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Building2 size={11} /> Clinic
                    </span>
                    <span className="text-xs">
                      {userData.tenant ? (
                        <span className="text-emerald-500">
                          {userData.tenant.clinicName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </span>
                  </div>
                  {userData.tenant && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CreditCard size={11} /> Plan
                      </span>
                      <StatusBadge value={userData.tenant.plan} />
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">
                      Audit events
                    </span>
                    <span className="text-xs font-mono">
                      {auditEntries.length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Actions */}
            <UserActions user={userData} />

            {/* Clinic section (if in a clinic) */}
            {userData.tenant && <ClinicSection tenant={userData.tenant} />}

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
                          href={`/audit?actorId=${userData.id}`}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
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
