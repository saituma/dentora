import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';
import type { CallSession } from '@/features/calls/types';

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export type ReminderChannelPreference = 'sms' | 'whatsapp' | 'both' | 'none';

export type PatientProfile = {
  id: string;
  tenantId: string;
  fullName: string;
  dateOfBirth: string | null;
  phoneNumber: string;
  lastVisitAt: string | null;
  notes: string | null;
  messagingConsent: boolean;
  messagingConsentAt: string | null;
  messagingOptedOutAt: string | null;
  preferredReminderChannel: ReminderChannelPreference;
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
  keepUnusedDataFor: 120,
  tagTypes: ['Patient'],
  endpoints: (builder) => ({
    getPatients: builder.query<{ data: PatientProfile[] }, { search?: string } | void>({
      query: (params) => ({
        url: '/patients',
        params: params ?? undefined,
      }),
    }),
    upsertPatient: builder.mutation<
      { data: PatientProfile },
      {
        fullName: string;
        phoneNumber: string;
        dateOfBirth?: string | null;
        notes?: string | null;
        lastVisitAt?: string | null;
      }
    >({
      query: (body) => ({
        url: '/patients/upsert',
        method: 'POST',
        body,
      }),
    }),
    importPatients: builder.mutation<{ data: ImportResult }, FormData>({
      query: (formData) => ({
        url: '/patients/import',
        method: 'POST',
        body: formData,
      }),
    }),
    getPatientById: builder.query<{ data: PatientProfile }, string>({
      query: (patientId) => `/patients/${patientId}`,
      providesTags: (_result, _error, patientId) => [{ type: 'Patient', id: patientId }],
    }),
    setPatientConsent: builder.mutation<
      { data: PatientProfile },
      { patientId: string; consent: boolean; preferredChannel?: ReminderChannelPreference }
    >({
      query: ({ patientId, consent, preferredChannel }) => ({
        url: `/patients/${patientId}/consent`,
        method: 'POST',
        body: { consent, ...(preferredChannel ? { preferredChannel } : {}) },
      }),
      invalidatesTags: (_result, _error, { patientId }) => [{ type: 'Patient', id: patientId }],
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
  useImportPatientsMutation,
  useGetPatientByIdQuery,
  useSetPatientConsentMutation,
  useGetPatientCallsQuery,
} = patientsApi;
