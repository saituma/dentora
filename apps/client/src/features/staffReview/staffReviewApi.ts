import { createApi } from '@reduxjs/toolkit/query/react';
import type { FetchArgs } from '@reduxjs/toolkit/query';
import { baseQueryWithReauth } from '@/lib/api';

export const staffReviewStatuses = ['open', 'in_review', 'resolved', 'ignored'] as const;
export const staffReviewSeverities = ['low', 'medium', 'high', 'critical'] as const;
export const staffReviewTypes = [
  'booking_failure',
  'reconciliation_failed',
  'reconciliation_retry_scheduled',
  'cancellation_requested',
  'reschedule_requested',
  'readiness_failure',
  'legacy_calendar_phi_detected',
  'media_stream_failure',
  'ai_tool_safety_block',
] as const;
export const staffReviewSources = [
  'ai_tool',
  'appointment_reconciliation',
  'onboarding_readiness',
  'calendar_phi_scanner',
  'media_stream',
  'system',
] as const;

export type StaffReviewStatus = (typeof staffReviewStatuses)[number];
export type StaffReviewSeverity = (typeof staffReviewSeverities)[number];
export type StaffReviewType = (typeof staffReviewTypes)[number];
export type StaffReviewSource = (typeof staffReviewSources)[number];

export interface StaffReviewFilters {
  status?: StaffReviewStatus;
  severity?: StaffReviewSeverity;
  type?: StaffReviewType;
  source?: StaffReviewSource;
  limit?: number;
}

export interface StaffReviewItem {
  id: string;
  tenantId: string;
  type: StaffReviewType;
  severity: StaffReviewSeverity;
  status: StaffReviewStatus;
  source: StaffReviewSource;
  reasonCode: string;
  message: string;
  relatedAppointmentId: string | null;
  relatedCallSessionId: string | null;
  relatedExternalEventRef: string | null;
  safeMetadata: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string | null;
  overdue: boolean;
}

export interface StaffReviewListResponse {
  data: StaffReviewItem[];
  summary: {
    count: number;
    overdueCount: number;
    highCriticalOpenCount: number;
  };
}

export interface StaffReviewAlertsResponse {
  data: StaffReviewItem[];
  summary: {
    count: number;
    overdueCount: number;
  };
}

export interface StaffReviewDigestItemRef {
  id: string;
  type: StaffReviewType;
  severity: StaffReviewSeverity;
  status: StaffReviewStatus;
  source: StaffReviewSource;
  reasonCode: string;
  createdAt: string;
  slaDueAt: string | null;
  overdue: boolean;
}

export interface StaffReviewDailyDigest {
  checkedAt: string;
  totalUnresolved: number;
  overdueCount: number;
  highCriticalOpenCount: number;
  countsBySeverity: Record<StaffReviewSeverity, number>;
  countsByStatus: Record<StaffReviewStatus, number>;
  countsByType: Partial<Record<StaffReviewType, number>>;
  countsBySource: Partial<Record<StaffReviewSource, number>>;
  itemRefs: StaffReviewDigestItemRef[];
}

export interface StaffReviewDigestResponse {
  data: StaffReviewDailyDigest;
}

export interface StaffReviewItemResponse {
  data: StaffReviewItem;
}

export function buildStaffReviewItemsQuery(filters: StaffReviewFilters): FetchArgs {
  const params: StaffReviewFilters = { limit: filters.limit ?? 100 };
  if (filters.status) params.status = filters.status;
  if (filters.severity) params.severity = filters.severity;
  if (filters.type) params.type = filters.type;
  if (filters.source) params.source = filters.source;
  return { url: '/staff-review/items', params };
}

export function buildStaffReviewStatusUpdateQuery(input: {
  id: string;
  status: StaffReviewStatus;
  resolutionNote?: string | null;
}): FetchArgs {
  return {
    url: `/staff-review/items/${encodeURIComponent(input.id)}/status`,
    method: 'PATCH',
    body: {
      status: input.status,
      resolutionNote: input.resolutionNote ?? null,
    },
  };
}

export const staffReviewApi = createApi({
  reducerPath: 'staffReviewApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['StaffReview'],
  endpoints: (builder) => ({
    getStaffReviewItems: builder.query<StaffReviewListResponse, StaffReviewFilters | void>({
      query: (filters) => buildStaffReviewItemsQuery(filters ?? {}),
      providesTags: ['StaffReview'],
    }),
    getStaffReviewAlertsDue: builder.query<StaffReviewAlertsResponse, { limit?: number } | void>({
      query: (params) => ({
        url: '/staff-review/alerts/due',
        params: { limit: params?.limit ?? 25 },
      }),
      providesTags: ['StaffReview'],
    }),
    getStaffReviewDailyDigest: builder.query<StaffReviewDigestResponse, { limit?: number } | void>({
      query: (params) => ({
        url: '/staff-review/digest/daily',
        params: { limit: params?.limit ?? 200 },
      }),
      providesTags: ['StaffReview'],
    }),
    updateStaffReviewItemStatus: builder.mutation<
      StaffReviewItemResponse,
      { id: string; status: StaffReviewStatus; resolutionNote?: string | null }
    >({
      query: buildStaffReviewStatusUpdateQuery,
      invalidatesTags: ['StaffReview'],
    }),
  }),
});

export const {
  useGetStaffReviewItemsQuery,
  useGetStaffReviewAlertsDueQuery,
  useGetStaffReviewDailyDigestQuery,
  useUpdateStaffReviewItemStatusMutation,
} = staffReviewApi;
