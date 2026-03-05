import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';
import type { DashboardStats, HourlyVolume } from './types';

interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export const analyticsApi = createApi({
  reducerPath: 'analyticsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Analytics'],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, DateRangeParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.startDate) searchParams.append('startDate', params.startDate);
        if (params?.endDate) searchParams.append('endDate', params.endDate);
        const qs = searchParams.toString();
        return `/analytics/dashboard${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Analytics'],
    }),
    getHourlyVolume: builder.query<{ data: HourlyVolume[] }, DateRangeParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.startDate) searchParams.append('startDate', params.startDate);
        if (params?.endDate) searchParams.append('endDate', params.endDate);
        const qs = searchParams.toString();
        return `/analytics/hourly${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Analytics'],
    }),
  }),
});

export const { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } = analyticsApi;
