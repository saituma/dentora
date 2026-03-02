import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { ClinicProfile } from './types';

export const clinicApi = createApi({
  reducerPath: 'clinicApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['Clinic'],
  endpoints: (builder) => ({
    getClinic: builder.query<ClinicProfile, string>({
      query: (id) => `/clinics/${id}`,
      providesTags: (_, __, id) => [{ type: 'Clinic', id }],
    }),
    updateClinic: builder.mutation<
      ClinicProfile,
      { id: string; data: Partial<ClinicProfile> }
    >({
      query: ({ id, data }) => ({
        url: `/clinics/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Clinic', id }],
    }),
  }),
});

export const { useGetClinicQuery, useUpdateClinicMutation } = clinicApi;
