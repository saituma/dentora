import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';
import type { BillingSummary, DailyCostTrend, PlanLimits, SubscriptionStatus } from './types';

interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Billing', 'Subscription'],
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
    getSubscription: builder.query<SubscriptionStatus, void>({
      query: () => '/billing/subscription',
      providesTags: ['Subscription'],
    }),
    createCheckoutSession: builder.mutation<
      { url: string },
      { planId: string; successUrl: string; cancelUrl: string }
    >({
      query: (body) => ({
        url: '/billing/create-checkout-session',
        method: 'POST',
        body,
      }),
    }),
    createPortalSession: builder.mutation<{ url: string }, { returnUrl?: string } | void>({
      query: (body) => ({
        url: '/billing/create-portal-session',
        method: 'POST',
        body: body ?? {},
      }),
    }),
  }),
});

export const {
  useGetSummaryQuery,
  useGetTrendQuery,
  useGetLimitsQuery,
  useGetSubscriptionQuery,
  useCreateCheckoutSessionMutation,
  useCreatePortalSessionMutation,
} = billingApi;
