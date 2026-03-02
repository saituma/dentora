import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { CallLog } from './types';

interface GetCallsParams {
  clinicId: string;
  startDate?: string;
  endDate?: string;
  outcome?: string;
  page?: number;
  limit?: number;
}

interface CallsResponse {
  calls: CallLog[];
  total: number;
}

export const callsApi = createApi({
  reducerPath: 'callsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Calls'],
  endpoints: (builder) => ({
    getCalls: builder.query<CallsResponse, GetCallsParams>({
      query: ({
        clinicId,
        startDate,
        endDate,
        outcome,
        page = 1,
        limit = 20,
      }) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (outcome && outcome !== 'all') params.append('outcome', outcome);
        params.append('page', String(page));
        params.append('limit', String(limit));
        return `/clinics/${clinicId}/calls?${params.toString()}`;
      },
      providesTags: (_, __, { clinicId }) => [{ type: 'Calls', id: clinicId }],
    }),
    getCallById: builder.query<CallLog, { clinicId: string; callId: string }>({
      query: ({ clinicId, callId }) => `/clinics/${clinicId}/calls/${callId}`,
      providesTags: (_, __, { callId }) => [{ type: 'Calls', id: callId }],
    }),
  }),
});

export const { useGetCallsQuery, useGetCallByIdQuery } = callsApi;
