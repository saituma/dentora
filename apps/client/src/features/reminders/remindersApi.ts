import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';

export type ReminderListItem = {
  id: string;
  channel: 'sms' | 'whatsapp';
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
  scheduledAt: string;
  sentAt: string | null;
  failureReason: string | null;
  appointmentId: string;
  patientName: string;
};

export const remindersApi = createApi({
  reducerPath: 'remindersApi',
  baseQuery: baseQueryWithReauth,
  keepUnusedDataFor: 60,
  endpoints: (builder) => ({
    getReminders: builder.query<{ data: ReminderListItem[] }, { limit?: number } | void>({
      query: (params) => ({
        url: '/reminders',
        params: params ?? undefined,
      }),
    }),
  }),
});

export const { useGetRemindersQuery } = remindersApi;
