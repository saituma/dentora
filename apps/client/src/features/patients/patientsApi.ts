import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';

export type PatientProfile = {
  id: string;
  tenantId: string;
  fullName: string;
  dateOfBirth: string | null;
  phoneNumber: string;
  lastVisitAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const patientsApi = createApi({
  reducerPath: 'patientsApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getPatients: builder.query<{ data: PatientProfile[] }, { search?: string } | void>({
      query: (params) => ({
        url: '/patients',
        params: params ?? undefined,
      }),
    }),
    upsertPatient: builder.mutation<{ data: PatientProfile }, {
      fullName: string;
      phoneNumber: string;
      dateOfBirth?: string | null;
      notes?: string | null;
      lastVisitAt?: string | null;
    }>({
      query: (body) => ({
        url: '/patients/upsert',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useGetPatientsQuery, useUpsertPatientMutation } = patientsApi;
