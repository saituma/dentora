import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { Integration } from './types';

interface CreateIntegrationRequest {
  integrationType: string;
  provider?: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

interface StartGoogleOAuthRequest {
  accountEmail?: string;
  calendarId?: string;
}

export const integrationsApi = createApi({
  reducerPath: 'integrationsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Integrations'],
  endpoints: (builder) => ({
    getIntegrations: builder.query<{ data: Integration[] }, void>({
      query: () => '/integrations',
      providesTags: ['Integrations'],
    }),
    createIntegration: builder.mutation<Integration, CreateIntegrationRequest>({
      query: (body) => ({
        url: '/integrations',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Integrations'],
    }),
    startGoogleCalendarOAuth: builder.mutation<{ authUrl: string; state: string }, StartGoogleOAuthRequest>({
      query: (body) => ({
        url: '/integrations/google/calendar/oauth/start',
        method: 'POST',
        body,
      }),
    }),
    activateIntegration: builder.mutation<Integration, string>({
      query: (id) => ({
        url: `/integrations/${id}/activate`,
        method: 'POST',
      }),
      invalidatesTags: ['Integrations'],
    }),
    testIntegration: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/integrations/${id}/test`,
        method: 'POST',
      }),
    }),
    deleteIntegration: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/integrations/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Integrations'],
    }),
  }),
});

export const {
  useGetIntegrationsQuery,
  useCreateIntegrationMutation,
  useStartGoogleCalendarOAuthMutation,
  useActivateIntegrationMutation,
  useTestIntegrationMutation,
  useDeleteIntegrationMutation,
} = integrationsApi;
