import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { BillingSummary, DailyCostTrend, PlanLimits } from './types';

interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Billing'],
  endpoints: (builder) => ({
    getSummary: builder.query<BillingSummary, DateRangeParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.startDate) searchParams.append('startDate', params.startDate);
        if (params?.endDate) searchParams.append('endDate', params.endDate);
        const qs = searchParams.toString();
        return `/billing/summary${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Billing'],
    }),
    getTrend: builder.query<{ data: DailyCostTrend[] }, DateRangeParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.startDate) searchParams.append('startDate', params.startDate);
        if (params?.endDate) searchParams.append('endDate', params.endDate);
        const qs = searchParams.toString();
        return `/billing/trend${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Billing'],
    }),
    getLimits: builder.query<PlanLimits, void>({
      query: () => '/billing/limits',
      providesTags: ['Billing'],
    }),
  }),
});

export const { useGetSummaryQuery, useGetTrendQuery, useGetLimitsQuery } = billingApi;
