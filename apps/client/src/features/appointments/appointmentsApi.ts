import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';

export interface AppointmentEvent {
  id: string;
  summary: string;
  description?: string;
  htmlLink?: string;
  start: string;
  end: string;
  status: string;
}

export interface UpcomingAppointmentsResponse {
  data: {
    calendarId: string;
    events: AppointmentEvent[];
  };
}

export const appointmentsApi = createApi({
  reducerPath: 'appointmentsApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getUpcomingAppointments: builder.query<UpcomingAppointmentsResponse, { days?: number } | void>({
      query: (params) => ({
        url: '/appointments/upcoming',
        params: params ?? undefined,
      }),
    }),
  }),
});

export const { useGetUpcomingAppointmentsQuery } = appointmentsApi;
