import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/lib/api";

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Stats", "Tenants", "Calls", "Users", "AuditLog", "Health"],
  endpoints: (builder) => ({
    getStats: builder.query<
      {
        totalTenants: number;
        activeTenants: number;
        totalCallsToday: number;
        activeProviders: number;
      },
      void
    >({
      query: () => "/admin/stats",
      providesTags: ["Stats"],
    }),

    getHealth: builder.query<
      { status: string; services: Record<string, boolean>; timestamp: string },
      void
    >({
      query: () => "/admin/health",
      providesTags: ["Health"],
    }),

    getTenants: builder.query<
      { data: Tenant[]; total: number },
      { limit?: number; offset?: number; search?: string }
    >({
      query: (params) => ({
        url: "/admin/tenants",
        params,
      }),
      providesTags: ["Tenants"],
    }),

    getTenant: builder.query<
      Tenant & {
        clinic?: Record<string, unknown>;
        integrations?: unknown[];
        users?: unknown[];
      },
      string
    >({
      query: (id) => `/admin/tenants/${id}`,
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

    getCalls: builder.query<
      { data: CallSession[]; total: number },
      { limit?: number; offset?: number; tenantId?: string; status?: string }
    >({
      query: (params) => ({
        url: "/admin/calls",
        params,
      }),
      providesTags: ["Calls"],
    }),

    getCall: builder.query<
      { session: CallSession; events: unknown[]; transcript: unknown },
      string
    >({
      query: (id) => `/admin/calls/${id}`,
    }),

    getUsers: builder.query<
      { data: AdminUser[]; total: number },
      { limit?: number; offset?: number; search?: string }
    >({
      query: (params) => ({
        url: "/admin/users",
        params,
      }),
      providesTags: ["Users"],
    }),

    getAuditLog: builder.query<
      { data: AuditEntry[]; total: number },
      { limit?: number; offset?: number; tenantId?: string; action?: string }
    >({
      query: (params) => ({
        url: "/admin/audit-log",
        params,
      }),
      providesTags: ["AuditLog"],
    }),
  }),
});

export const {
  useGetStatsQuery,
  useGetHealthQuery,
  useGetTenantsQuery,
  useGetTenantQuery,
  useUpdateTenantStatusMutation,
  useGetCallsQuery,
  useGetCallQuery,
  useGetUsersQuery,
  useGetAuditLogQuery,
} = adminApi;

export interface Tenant {
  id: string;
  clinicName: string;
  clinicSlug: string;
  plan: string;
  status: string;
  totalCalls?: number;
  activeNumbers?: number;
  createdAt: string;
  updatedAt: string;
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
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
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

export interface AuditEntry {
  id: string;
  tenantId?: string;
  actorId?: string;
  actorType?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
