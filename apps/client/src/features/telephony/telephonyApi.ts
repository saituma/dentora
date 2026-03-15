import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';

export interface TelephonyNumber {
  id: string;
  phoneNumber: string;
  twilioSid: string;
  friendlyName?: string | null;
  status?: string | null;
}

export interface AssignTelephonyNumberRequest {
  phoneNumber: string;
  twilioSid: string;
  friendlyName?: string;
}

export interface TwilioIncomingNumber {
  sid: string;
  phoneNumber: string;
  friendlyName?: string | null;
  capabilities?: Record<string, boolean> | null;
}

export interface TelephonyWebhookBase {
  baseUrl: string;
}

export interface TwilioClientToken {
  token: string;
  identity: string;
  expiresIn: number;
}

export const telephonyApi = createApi({
  reducerPath: 'telephonyApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['TelephonyNumbers'],
  endpoints: (builder) => ({
    getTelephonyNumbers: builder.query<{ data: TelephonyNumber[] }, void>({
      query: () => '/telephony/numbers',
      providesTags: ['TelephonyNumbers'],
    }),
    getTwilioIncomingNumbers: builder.query<{ data: TwilioIncomingNumber[] }, void>({
      query: () => '/telephony/twilio/numbers',
    }),
    getTelephonyWebhookBase: builder.query<TelephonyWebhookBase, void>({
      query: () => '/telephony/webhook-base',
    }),
    createTwilioClientToken: builder.mutation<{ data: TwilioClientToken }, void>({
      query: () => ({
        url: '/telephony/client/token',
        method: 'POST',
      }),
    }),
    assignTelephonyNumber: builder.mutation<TelephonyNumber, AssignTelephonyNumberRequest>({
      query: (body) => ({
        url: '/telephony/numbers',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['TelephonyNumbers'],
    }),
    releaseTelephonyNumber: builder.mutation<{ message: string }, string>({
      query: (numberId) => ({
        url: `/telephony/numbers/${numberId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['TelephonyNumbers'],
    }),
  }),
});

export const {
  useGetTelephonyNumbersQuery,
  useGetTwilioIncomingNumbersQuery,
  useGetTelephonyWebhookBaseQuery,
  useCreateTwilioClientTokenMutation,
  useAssignTelephonyNumberMutation,
  useReleaseTelephonyNumberMutation,
} = telephonyApi;
