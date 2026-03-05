import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';
import type { ClinicProfile } from './types';

export const clinicApi = createApi({
  reducerPath: 'clinicApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Clinic'],
  endpoints: (builder) => ({
    getClinic: builder.query<ClinicProfile, void>({
      query: () => '/config/clinic',
      providesTags: ['Clinic'],
    }),
    updateClinic: builder.mutation<ClinicProfile, Partial<ClinicProfile>>({
      query: (data) => ({
        url: '/config/clinic',
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Clinic'],
    }),
  }),
});

export const { useGetClinicQuery, useUpdateClinicMutation } = clinicApi;
