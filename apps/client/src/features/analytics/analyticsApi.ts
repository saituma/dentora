import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { AnalyticsMetrics } from './types';

interface GetMetricsParams {
  clinicId: string;
  startDate: string;
  endDate: string;
}

export const analyticsApi = createApi({
  reducerPath: 'analyticsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Analytics'],
  endpoints: (builder) => ({
    getMetrics: builder.query<AnalyticsMetrics, GetMetricsParams>({
      query: ({ clinicId, startDate, endDate }) =>
        `/clinics/${clinicId}/analytics/metrics?startDate=${startDate}&endDate=${endDate}`,
      providesTags: (_, __, { clinicId }) => [
        { type: 'Analytics', id: clinicId },
      ],
    }),
    exportCsv: builder.mutation<string, GetMetricsParams>({
      query: ({ clinicId, startDate, endDate }) => ({
        url: `/clinics/${clinicId}/analytics/export?startDate=${startDate}&endDate=${endDate}`,
        responseHandler: (response) => response.text(),
      }),
    }),
  }),
});

export const { useGetMetricsQuery, useExportCsvMutation } = analyticsApi;
