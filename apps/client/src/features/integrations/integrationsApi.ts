import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { ApiKey } from './types';

export const integrationsApi = createApi({
  reducerPath: 'integrationsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Integrations'],
  endpoints: (builder) => ({
    connectCalendar: builder.mutation<
      { url: string },
      { clinicId: string; provider: 'google' | 'outlook' }
    >({
      query: ({ clinicId, provider }) => ({
        url: `/clinics/${clinicId}/integrations/calendar/connect`,
        method: 'POST',
        body: { provider },
      }),
      invalidatesTags: (_, __, { clinicId }) => [
        { type: 'Integrations', id: clinicId },
      ],
    }),
    getApiKeys: builder.query<ApiKey[], string>({
      query: (clinicId) => `/clinics/${clinicId}/integrations/api-keys`,
      providesTags: (_, __, clinicId) => [
        { type: 'Integrations', id: clinicId },
      ],
    }),
    createApiKey: builder.mutation<
      { key: string },
      { clinicId: string; name: string }
    >({
      query: ({ clinicId, name }) => ({
        url: `/clinics/${clinicId}/integrations/api-keys`,
        method: 'POST',
        body: { name },
      }),
      invalidatesTags: (_, __, { clinicId }) => [
        { type: 'Integrations', id: clinicId },
      ],
    }),
  }),
});

export const {
  useConnectCalendarMutation,
  useGetApiKeysQuery,
  useCreateApiKeyMutation,
} = integrationsApi;
