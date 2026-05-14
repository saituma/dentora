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
