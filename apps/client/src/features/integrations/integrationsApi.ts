import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';
import type {
  DentallyVerificationReport,
  DentallyVerificationResult,
  Integration,
  IntegrationLogEvent,
  IntegrationLogFilters,
  ProviderConfigureRequest,
  ProviderDetail,
  SchedulingConfig,
  SchedulingProvider,
  UpdateSchedulingConfigRequest,
  VendorAccessPacket,
} from './types';

interface CreateIntegrationRequest {
  integrationType: string;
  provider?: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

interface StartGoogleOAuthRequest {
  accountEmail?: string;
  calendarId?: string;
  returnTo?: string;
}

export const integrationsApi = createApi({
  reducerPath: 'integrationsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Integrations'],
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    getIntegrations: builder.query<{ data: Integration[] }, void>({
      query: () => '/integrations',
      providesTags: ['Integrations'],
    }),
    getProviderDetail: builder.query<ProviderDetail, SchedulingProvider>({
      query: (provider) => `/pms/providers/${provider}`,
      providesTags: ['Integrations'],
    }),
    getVendorAccessPacket: builder.query<
      { data: VendorAccessPacket },
      Extract<SchedulingProvider, 'soe_exact' | 'cs_r4_plus'>
    >({
      query: (provider) => `/pms/providers/${provider}/vendor-access-packet`,
      providesTags: ['Integrations'],
    }),
    getSchedulingConfig: builder.query<{ data: SchedulingConfig }, void>({
      query: () => '/pms/scheduling-config',
      providesTags: ['Integrations'],
    }),
    updateSchedulingConfig: builder.mutation<
      { data: SchedulingConfig },
      UpdateSchedulingConfigRequest
    >({
      query: (body) => ({
        url: '/pms/scheduling-config',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Integrations'],
    }),
    configureProvider: builder.mutation<
      ProviderDetail,
      { provider: SchedulingProvider; body: ProviderConfigureRequest }
    >({
      query: ({ provider, body }) => ({
        url: `/pms/providers/${provider}/configure`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Integrations'],
    }),
    runDentallyVerification: builder.mutation<
      { data: DentallyVerificationResult },
      { type: string; body?: Record<string, unknown> }
    >({
      query: ({ type, body }) => ({
        url: `/pms/dentally/verify/${type}`,
        method: 'POST',
        body: body ?? {},
      }),
    }),
    getDentallyVerificationReport: builder.query<
      { data: DentallyVerificationReport },
      { integrationId?: string } | void
    >({
      query: (input) => {
        const integrationId = input?.integrationId;
        return integrationId
          ? `/pms/dentally/verify/report?integrationId=${encodeURIComponent(integrationId)}`
          : '/pms/dentally/verify/report';
      },
      providesTags: ['Integrations'],
    }),
    getIntegrationLogs: builder.query<
      { data: IntegrationLogEvent[] },
      IntegrationLogFilters | void
    >({
      query: (filters) => {
        const params = new URLSearchParams();
        if (filters?.provider && filters.provider !== 'all')
          params.set('provider', filters.provider);
        if (filters?.status) params.set('status', filters.status);
        if (filters?.eventType) params.set('eventType', filters.eventType);
        if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters?.dateTo) params.set('dateTo', filters.dateTo);
        const query = params.toString();
        return query ? `/pms/integration-events?${query}` : '/pms/integration-events';
      },
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
    startGoogleCalendarOAuth: builder.mutation<
      { authUrl: string; state: string },
      StartGoogleOAuthRequest
    >({
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
  useGetProviderDetailQuery,
  useGetVendorAccessPacketQuery,
  useGetSchedulingConfigQuery,
  useUpdateSchedulingConfigMutation,
  useConfigureProviderMutation,
  useRunDentallyVerificationMutation,
  useGetDentallyVerificationReportQuery,
  useGetIntegrationLogsQuery,
  useCreateIntegrationMutation,
  useStartGoogleCalendarOAuthMutation,
  useActivateIntegrationMutation,
  useTestIntegrationMutation,
  useDeleteIntegrationMutation,
} = integrationsApi;
