import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { Subscription, Usage, Invoice } from './types';

export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Billing'],
  endpoints: (builder) => ({
    getSubscription: builder.query<Subscription, string>({
      query: (clinicId) => `/clinics/${clinicId}/billing/subscription`,
      providesTags: (_, __, clinicId) => [{ type: 'Billing', id: clinicId }],
    }),
    getUsage: builder.query<Usage, string>({
      query: (clinicId) => `/clinics/${clinicId}/billing/usage`,
      providesTags: (_, __, clinicId) => [{ type: 'Billing', id: clinicId }],
    }),
    getInvoices: builder.query<Invoice[], string>({
      query: (clinicId) => `/clinics/${clinicId}/billing/invoices`,
      providesTags: (_, __, clinicId) => [{ type: 'Billing', id: clinicId }],
    }),
  }),
});

export const {
  useGetSubscriptionQuery,
  useGetUsageQuery,
  useGetInvoicesQuery,
} = billingApi;
