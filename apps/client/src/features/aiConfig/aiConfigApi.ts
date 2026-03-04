import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { VoiceProfile, Service, BookingRules, Policy, Faq, ConfigVersion } from './types';

export const aiConfigApi = createApi({
  reducerPath: 'aiConfigApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Voice', 'Services', 'BookingRules', 'Policies', 'Faqs', 'ConfigVersions'],
  endpoints: (builder) => ({
    // Voice profile
    getVoiceProfile: builder.query<VoiceProfile | null, void>({
      query: () => '/config/voice',
      providesTags: ['Voice'],
    }),
    updateVoiceProfile: builder.mutation<VoiceProfile, Partial<VoiceProfile>>({
      query: (data) => ({
        url: '/config/voice',
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Voice'],
    }),

    // Services
    getServices: builder.query<{ data: Service[] }, void>({
      query: () => '/config/services',
      providesTags: ['Services'],
    }),
    addService: builder.mutation<Service, { serviceName: string; category?: string; description?: string; durationMinutes?: number; price?: string; isActive?: boolean }>({
      query: (data) => ({
        url: '/config/services',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Services'],
    }),
    updateService: builder.mutation<Service, { id: string; data: Partial<Service> }>({
      query: ({ id, data }) => ({
        url: `/config/services/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Services'],
    }),
    deleteService: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/config/services/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Services'],
    }),

    // Booking rules
    getBookingRules: builder.query<BookingRules | null, void>({
      query: () => '/config/booking-rules',
      providesTags: ['BookingRules'],
    }),
    updateBookingRules: builder.mutation<BookingRules, Partial<BookingRules>>({
      query: (data) => ({
        url: '/config/booking-rules',
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['BookingRules'],
    }),

    // Policies
    getPolicies: builder.query<{ data: Policy[] }, void>({
      query: () => '/config/policies',
      providesTags: ['Policies'],
    }),
    addPolicy: builder.mutation<Policy, { policyType: string; content: string }>({
      query: (data) => ({
        url: '/config/policies',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Policies'],
    }),
    updatePolicy: builder.mutation<Policy, { id: string; data: Partial<Policy> }>({
      query: ({ id, data }) => ({
        url: `/config/policies/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Policies'],
    }),
    deletePolicy: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/config/policies/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Policies'],
    }),

    // FAQs
    getFaqs: builder.query<{ data: Faq[] }, void>({
      query: () => '/config/faqs',
      providesTags: ['Faqs'],
    }),
    addFaq: builder.mutation<Faq, { question: string; answer: string; category?: string }>({
      query: (data) => ({
        url: '/config/faqs',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Faqs'],
    }),
    updateFaq: builder.mutation<Faq, { id: string; data: Partial<Faq> }>({
      query: ({ id, data }) => ({
        url: `/config/faqs/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Faqs'],
    }),
    deleteFaq: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/config/faqs/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Faqs'],
    }),

    // Config versions
    getConfigVersions: builder.query<{ data: ConfigVersion[] }, void>({
      query: () => '/config/versions',
      providesTags: ['ConfigVersions'],
    }),
    createConfigVersion: builder.mutation<ConfigVersion, void>({
      query: () => ({
        url: '/config/versions',
        method: 'POST',
      }),
      invalidatesTags: ['ConfigVersions'],
    }),
    publishConfigVersion: builder.mutation<ConfigVersion, string>({
      query: (id) => ({
        url: `/config/versions/${id}/publish`,
        method: 'POST',
      }),
      invalidatesTags: ['ConfigVersions'],
    }),
  }),
});

export const {
  useGetVoiceProfileQuery,
  useUpdateVoiceProfileMutation,
  useGetServicesQuery,
  useAddServiceMutation,
  useUpdateServiceMutation,
  useDeleteServiceMutation,
  useGetBookingRulesQuery,
  useUpdateBookingRulesMutation,
  useGetPoliciesQuery,
  useAddPolicyMutation,
  useUpdatePolicyMutation,
  useDeletePolicyMutation,
  useGetFaqsQuery,
  useAddFaqMutation,
  useUpdateFaqMutation,
  useDeleteFaqMutation,
  useGetConfigVersionsQuery,
  useCreateConfigVersionMutation,
  usePublishConfigVersionMutation,
} = aiConfigApi;
