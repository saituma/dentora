import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { CallSession, CallEvent } from './types';

interface GetCallsParams {
  limit?: number;
  offset?: number;
}

export const callsApi = createApi({
  reducerPath: 'callsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Calls'],
  endpoints: (builder) => ({
    getCalls: builder.query<{ data: CallSession[] }, GetCallsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.append('limit', String(params.limit));
        if (params?.offset) searchParams.append('offset', String(params.offset));
        const qs = searchParams.toString();
        return `/calls${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Calls'],
    }),
    getCallById: builder.query<CallSession, string>({
      query: (callId) => `/calls/${callId}`,
      providesTags: (_, __, callId) => [{ type: 'Calls', id: callId }],
    }),
    getCallEvents: builder.query<{ data: CallEvent[] }, string>({
      query: (callId) => `/calls/${callId}/events`,
      providesTags: (_, __, callId) => [{ type: 'Calls', id: `events-${callId}` }],
    }),
  }),
});

export const { useGetCallsQuery, useGetCallByIdQuery, useGetCallEventsQuery } = callsApi;
