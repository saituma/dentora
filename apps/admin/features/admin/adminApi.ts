import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/lib/api";

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Stats",
    "Tenants",
    "Tenant",
    "Calls",
    "Call",
    "Users",
    "AuditLog",
    "Health",
    "Config",
    "Ops",
    "Analytics",
    "PhonePool",
    "DemoRequests",
  ],
  endpoints: (builder) => ({
    // ── Platform ───────────────────────────────────────────────────────
    getStats: builder.query<PlatformStats, void>({
      query: () => "/admin/stats",
      providesTags: ["Stats"],
    }),
    getHealth: builder.query<HealthResponse, void>({
      query: () => "/admin/health",
      providesTags: ["Health"],
    }),
    runDataRetention: builder.mutation<{ deleted: number }, void>({
      query: () => ({ url: "/admin/data-retention/run", method: "POST" }),
    }),
    getConfig: builder.query<{ key: string; value: string }, string>({
      query: (key) => `/admin/config/${key}`,
      providesTags: (_r, _e, key) => [{ type: "Config", id: key }],
    }),
    setConfig: builder.mutation<
      { message: string },
      { key: string; value: string; description?: string }
    >({
      query: ({ key, ...body }) => ({
        url: `/admin/config/${key}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { key }) => [{ type: "Config", id: key }],
    }),

    // ── Tenants ────────────────────────────────────────────────────────
    getTenants: builder.query<PaginatedResponse<Tenant>, TenantsQuery>({
      query: (params) => ({ url: "/admin/tenants", params }),
      providesTags: ["Tenants"],
    }),
    getTenant: builder.query<TenantDetail, string>({
      query: (id) => `/admin/tenants/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Tenant", id }],
    }),
    updateTenantStatus: builder.mutation<
      unknown,
      { tenantId: string; status: string }
    >({
      query: ({ tenantId, status }) => ({
        url: `/tenants/${tenantId}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["Tenants"],
    }),

    // ── Calls ──────────────────────────────────────────────────────────
    getCalls: builder.query<PaginatedResponse<CallSession>, CallsQuery>({
      query: (params) => ({ url: "/admin/calls", params }),
      providesTags: ["Calls"],
    }),
    getCall: builder.query<CallDetail, string>({
      query: (id) => `/admin/calls/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Call", id }],
    }),

    // ── Users ──────────────────────────────────────────────────────────
    getUsers: builder.query<PaginatedResponse<AdminUser>, UsersQuery>({
      query: (params) => ({ url: "/admin/users", params }),
      providesTags: ["Users"],
    }),
    getUser: builder.query<AdminUserDetail, string>({
      query: (id) => `/admin/users/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Users", id }],
    }),

    // ── Audit log ──────────────────────────────────────────────────────
    getAuditLog: builder.query<PaginatedResponse<AuditEntry>, AuditQuery>({
      query: (params) => ({ url: "/admin/audit-log", params }),
      providesTags: ["AuditLog"],
    }),

    // ── Ops (cost / breakers / queues / providers) ──────────────────────
    getOpsCost: builder.query<OpsCostResponse, { days?: number } | void>({
      query: (params) => ({ url: "/admin/ops/cost", params: params ?? {} }),
      providesTags: ["Ops"],
    }),
    getOpsBreakers: builder.query<OpsBreakersResponse, void>({
      query: () => "/admin/ops/breakers",
      providesTags: ["Ops"],
    }),
    getOpsQueues: builder.query<OpsQueuesResponse, void>({
      query: () => "/admin/ops/queues",
      providesTags: ["Ops"],
    }),
    getOpsProviders: builder.query<OpsProvidersResponse, void>({
      query: () => "/admin/ops/providers",
      providesTags: ["Ops"],
    }),

    // ── Analytics (platform-wide) ───────────────────────────────────────
    getAnalyticsDashboard: builder.query<
      DashboardStats,
      { days?: number } | void
    >({
      query: (params) => ({
        url: "/admin/analytics/dashboard",
        params: params ?? {},
      }),
      providesTags: ["Analytics"],
    }),
    getAnalyticsHourly: builder.query<
      { data: HourlyVolumePoint[] },
      { days?: number } | void
    >({
      query: (params) => ({
        url: "/admin/analytics/hourly",
        params: params ?? {},
      }),
      providesTags: ["Analytics"],
    }),

    // ── Phone pool ──────────────────────────────────────────────────────
    getPhonePool: builder.query<PaginatedResponse<PhoneNumber>, void>({
      query: () => "/admin/phone-pool",
      providesTags: ["PhonePool"],
    }),

    // ── Tenant calls ────────────────────────────────────────────────────
    getTenantCalls: builder.query<
      PaginatedResponse<CallSession>,
      { tenantId: string; limit?: number; offset?: number }
    >({
      query: ({ tenantId, ...params }) => ({
        url: `/admin/tenants/${tenantId}/calls`,
        params,
      }),
      providesTags: (_r, _e, { tenantId }) => [{ type: "Calls", id: tenantId }],
    }),

    // ── ACTIONS: tenant ─────────────────────────────────────────────────
    updateTenantPlan: builder.mutation<
      { message: string; plan: string },
      { tenantId: string; plan: string }
    >({
      query: ({ tenantId, plan }) => ({
        url: `/admin/tenants/${tenantId}/plan`,
        method: "PATCH",
        body: { plan },
      }),
      invalidatesTags: (_r, _e, { tenantId }) => [
        { type: "Tenant", id: tenantId },
        "Tenants",
      ],
    }),
    invalidateTenantConfigCache: builder.mutation<
      { message: string; keysCleared: number },
      string
    >({
      query: (tenantId) => ({
        url: `/admin/tenants/${tenantId}/invalidate-config-cache`,
        method: "POST",
      }),
    }),
    runPhiDryRun: builder.mutation<{ data: unknown }, string>({
      query: (tenantId) => ({
        url: `/admin/tenants/${tenantId}/phi-remediation/dry-run`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, tenantId) => [{ type: "Tenant", id: tenantId }],
    }),

    // ── ACTIONS: users ──────────────────────────────────────────────────
    updateUserRole: builder.mutation<
      { message: string; role: string },
      { userId: string; tenantId: string; role: string }
    >({
      query: ({ userId, tenantId, role }) => ({
        url: `/admin/users/${userId}/role`,
        method: "PATCH",
        body: { tenantId, role },
      }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: "Users", id: userId }],
    }),
    resetUserMfa: builder.mutation<{ message: string }, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/reset-mfa`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, userId) => [{ type: "Users", id: userId }],
    }),
    verifyUserEmail: builder.mutation<{ message: string }, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/verify-email`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, userId) => [{ type: "Users", id: userId }],
    }),
    revokeUserSessions: builder.mutation<
      { message: string; revoked: number },
      string
    >({
      query: (userId) => ({
        url: `/admin/users/${userId}/revoke-sessions`,
        method: "POST",
      }),
    }),
    sendPasswordReset: builder.mutation<{ message: string }, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/password-reset`,
        method: "POST",
      }),
    }),
    impersonateUser: builder.mutation<
      { token: string; tenantId: string; email: string },
      string
    >({
      query: (userId) => ({
        url: `/admin/users/${userId}/impersonate`,
        method: "POST",
      }),
    }),
    deleteUser: builder.mutation<{ message: string }, string>({
      query: (userId) => ({ url: `/admin/users/${userId}`, method: "DELETE" }),
      invalidatesTags: ["Users"],
    }),

    // ── ACTIONS: ops ────────────────────────────────────────────────────
    retryQueue: builder.mutation<
      { message: string; retried: number },
      { name: string; limit?: number }
    >({
      query: ({ name, limit }) => ({
        url: `/admin/ops/queues/${name}/retry`,
        method: "POST",
        body: { limit },
      }),
      invalidatesTags: ["Ops"],
    }),
    cleanQueue: builder.mutation<
      { message: string; removed: number },
      { name: string; status?: "failed" | "completed" }
    >({
      query: ({ name, status }) => ({
        url: `/admin/ops/queues/${name}/clean`,
        method: "POST",
        body: { status },
      }),
      invalidatesTags: ["Ops"],
    }),
    resetBreaker: builder.mutation<
      { message: string; existed: boolean },
      string
    >({
      query: (name) => ({
        url: `/admin/ops/breakers/${name}/reset`,
        method: "POST",
      }),
      invalidatesTags: ["Ops"],
    }),
    getAlertsMute: builder.query<{ muted: boolean }, void>({
      query: () => "/admin/ops/alerts/mute",
      providesTags: ["Ops"],
    }),
    muteAlerts: builder.mutation<
      { message: string; muted: boolean },
      { minutes: number }
    >({
      query: (body) => ({
        url: "/admin/ops/alerts/mute",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Ops"],
    }),

    // ── ACTIONS: phone pool ─────────────────────────────────────────────
    buyPhoneNumber: builder.mutation<
      { number: unknown },
      { countryCode?: string }
    >({
      query: (body) => ({ url: "/admin/phone-pool/buy", method: "POST", body }),
      invalidatesTags: ["PhonePool"],
    }),
    assignPhoneNumber: builder.mutation<
      { data: unknown },
      { numberId: string; tenantId: string }
    >({
      query: ({ numberId, tenantId }) => ({
        url: `/admin/phone-pool/${numberId}/assign`,
        method: "POST",
        body: { tenantId },
      }),
      invalidatesTags: ["PhonePool"],
    }),
    releasePhoneNumber: builder.mutation<{ message: string }, string>({
      query: (numberId) => ({
        url: `/admin/phone-pool/${numberId}/release`,
        method: "POST",
      }),
      invalidatesTags: ["PhonePool"],
    }),

    // ── Demo requests ──────────────────────────────────────────────────
    getDemoRequests: builder.query<
      PaginatedResponse<DemoRequest>,
      DemoRequestsQuery
    >({
      query: (params) => ({ url: "/demo-requests", params }),
      providesTags: ["DemoRequests"],
    }),
  }),
});

export const {
  useGetStatsQuery,
  useGetHealthQuery,
  useRunDataRetentionMutation,
  useGetConfigQuery,
  useSetConfigMutation,
  useGetTenantsQuery,
  useGetTenantQuery,
  useUpdateTenantStatusMutation,
  useGetCallsQuery,
  useGetCallQuery,
  useGetUsersQuery,
  useGetUserQuery,
  useGetAuditLogQuery,
  useGetOpsCostQuery,
  useGetOpsBreakersQuery,
  useGetOpsQueuesQuery,
  useGetOpsProvidersQuery,
  useGetAnalyticsDashboardQuery,
  useGetAnalyticsHourlyQuery,
  useGetPhonePoolQuery,
  useGetTenantCallsQuery,
  useUpdateTenantPlanMutation,
  useInvalidateTenantConfigCacheMutation,
  useRunPhiDryRunMutation,
  useUpdateUserRoleMutation,
  useResetUserMfaMutation,
  useVerifyUserEmailMutation,
  useRevokeUserSessionsMutation,
  useSendPasswordResetMutation,
  useImpersonateUserMutation,
  useDeleteUserMutation,
  useRetryQueueMutation,
  useCleanQueueMutation,
  useResetBreakerMutation,
  useGetAlertsMuteQuery,
  useMuteAlertsMutation,
  useBuyPhoneNumberMutation,
  useAssignPhoneNumberMutation,
  useReleasePhoneNumberMutation,
  useGetDemoRequestsQuery,
} = adminApi;

// ── Query param types ───────────────────────────────────────────────────

export interface TenantsQuery {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  plan?: string;
}

export interface CallsQuery {
  limit?: number;
  offset?: number;
  tenantId?: string;
  status?: string;
}

export interface UsersQuery {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface AuditQuery {
  limit?: number;
  offset?: number;
  tenantId?: string;
  action?: string;
  actorId?: string;
}

// ── Response types ──────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalCallsToday: number;
  activeProviders: number;
}

export interface HealthResponse {
  status: string;
  services: Record<string, boolean>;
  timestamp: string;
}

export interface Tenant {
  id: string;
  clinicName: string;
  clinicSlug: string;
  plan: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  totalCalls?: number;
  activeNumbers?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDetail extends Tenant {
  clinicProfile?: Record<string, unknown>[];
  integrations?: Integration[];
  users?: TenantUser[];
  latestConfigVersion?: ConfigVersion | null;
  preflight?: PreflightStatus | null;
}

export interface TenantUser {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  createdAt: string;
}

export interface Integration {
  id: string;
  provider: string;
  status: string;
  createdAt: string;
}

export interface CallSession {
  id: string;
  tenantId: string;
  clinicName?: string;
  callerNumber?: string;
  clinicNumber?: string;
  status: string;
  intentSummary?: string;
  durationSeconds?: number;
  endReason?: string;
  aiProvider?: string;
  aiModel?: string;
  costEstimate?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface CallEvent {
  id: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  latencyMs?: number;
  timestamp: string;
}

export interface CallTranscript {
  id: string;
  fullTranscript: unknown[];
  summary?: string;
  sentiment?: string;
  intentDetected?: string;
  createdAt: string;
}

export interface CallDetail {
  data: CallSession & {
    events: CallEvent[];
    transcripts: CallTranscript[];
  };
}

export interface AdminUser {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  tenantId?: string;
  clinicName?: string;
  createdAt: string;
}

export interface ClinicProfileSnapshot {
  id: string;
  clinicName: string;
  legalEntityName?: string;
  timezone?: string;
  primaryPhone?: string;
  supportEmail?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  businessHours?: Record<string, unknown>;
  specialties?: unknown[];
  staffMembers?: unknown[];
  description?: string;
  status: string;
  configVersion?: number;
  updatedAt: string;
}

export interface ConfigVersion {
  version: number;
  status: string;
  completenessScore: string;
  publishedAt?: string;
  createdAt: string;
}

export interface PreflightStatus {
  lastPreflightReady?: boolean;
  lastPreflightCheckedAt?: string;
  lastBlockingIssueCodes: string[];
  lastWarningCodes: string[];
  latestCalendarPhiScanAt?: string;
  latestCalendarPhiTotalEvents?: number;
  latestCalendarPhiRiskyEvents?: number;
}

export interface TenantSummary {
  id: string;
  tenantRole: string;
  clinicName: string;
  clinicSlug: string;
  plan: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  clinicProfile?: ClinicProfileSnapshot;
  latestConfigVersion?: ConfigVersion;
  preflight?: PreflightStatus;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  tenant?: TenantSummary;
}

export interface AuditEntry {
  id: string;
  tenantId?: string;
  actorId?: string;
  actorType?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Ops / analytics / phone-pool types ──────────────────────────────────

export interface OpsCostResponse {
  daily: Array<{ day: string; cost: number }>;
  byProvider: Array<{ provider: string; cost: number }>;
  topTenants: Array<{ clinicName: string; calls: number; cost: number }>;
  todayCost: number;
  totalCost: number;
  days: number;
}

export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface OpsBreakersResponse {
  breakers: Record<
    string,
    { state: CircuitBreakerState; failures: number; dyno?: string }
  >;
}

export interface QueueDepth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  available: boolean;
}

export interface OpsQueuesResponse {
  queues: QueueDepth[];
}

export interface ProviderPerformance {
  provider: string;
  avgLatencyMs: number;
  totalCalls: number;
  failureRate: number;
}

export interface OpsProvidersResponse {
  providers: ProviderPerformance[];
}

export interface DashboardStats {
  totalCalls: number;
  averageDurationSeconds: number;
  completionRate: number;
  bookingRate: number;
  bookedCalls: number;
  hangupCount: number;
  totalCost: string;
  sentimentBreakdown: Record<string, number>;
  topIntents: Array<{ intent: string; count: number }>;
  callsByStatus: Record<string, number>;
  averageLatencyMs: number;
}

export interface HourlyVolumePoint {
  hour: string;
  calls: number;
}

export interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName?: string | null;
  status: string;
  capabilities?: { voice?: boolean; sms?: boolean };
  tenantId?: string | null;
  clinicName?: string | null;
  createdAt: string;
}

export interface DemoRequest {
  id: string;
  fullName: string;
  email: string;
  phoneE164: string;
  phoneCountry: string;
  message: string;
  source: string;
  createdAt: string;
}

export interface DemoRequestsQuery {
  limit?: number;
  offset?: number;
  search?: string;
}
