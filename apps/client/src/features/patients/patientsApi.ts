import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';
import type { CallSession } from '@/features/calls/types';

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

export type PatientCall = CallSession & {
  transcriptSummary: string | null;
  intentDetected: string | null;
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
    getPatientById: builder.query<{ data: PatientProfile }, string>({
      query: (patientId) => `/patients/${patientId}`,
    }),
    getPatientCalls: builder.query<{ data: PatientCall[] }, { patientId: string; limit?: number }>({
      query: ({ patientId, limit }) => ({
        url: `/patients/${patientId}/calls`,
        params: limit ? { limit } : undefined,
      }),
    }),
  }),
});

export const {
  useGetPatientsQuery,
  useUpsertPatientMutation,
  useGetPatientByIdQuery,
  useGetPatientCallsQuery,
} = patientsApi;
