'use client';

import { useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import './fullcalendar.css';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGetUpcomingAppointmentsQuery } from '@/features/appointments/appointmentsApi';
import { useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';
import { skipToken } from '@reduxjs/toolkit/query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

const formatDateTime = (value: string) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getErrorMessage = (error: unknown): string => {
  if (!error) return '';
  const maybeFetchError = error as FetchBaseQueryError;
  if (typeof maybeFetchError === 'object' && maybeFetchError && 'status' in maybeFetchError) {
    const data = maybeFetchError.data as any;
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
    if (typeof data === 'string') return data;
    return `Request failed (${String(maybeFetchError.status)})`;
  }
  return 'Request failed';
};

export default function AppointmentsPage() {
  const { data: integrationsData } = useGetIntegrationsQuery();
  const calendarIntegration = useMemo(() => (
    integrationsData?.data?.find((integration) => (
      integration.integrationType === 'calendar' && integration.provider === 'google_calendar'
    )) ?? null
  ), [integrationsData?.data]);

  const hasActiveCalendar = calendarIntegration?.status === 'active';
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useGetUpcomingAppointmentsQuery(hasActiveCalendar ? { days: 60 } : skipToken);
  const events = data?.data?.events ?? [];
  const errorMessage = getErrorMessage(error);
  const [selectedEvent, setSelectedEvent] = useState<{
    title: string;
    start: string;
    end: string;
    status: string;
    description?: string;
    htmlLink?: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const calendarEvents = useMemo(() => events.map((event) => ({
    id: event.id,
    title: event.summary,
    start: event.start,
    end: event.end,
    extendedProps: {
      description: event.description,
      htmlLink: event.htmlLink,
      status: event.status,
    },
  })), [events]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
          <CardDescription>
            Upcoming bookings synced from your connected Google Calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={calendarIntegration?.status === 'active' ? 'default' : 'secondary'}>
            {calendarIntegration?.status === 'active' ? 'Calendar Connected' : 'Calendar Not Connected'}
          </Badge>
          {calendarIntegration?.config?.calendarId ? (
            <span className="text-sm text-muted-foreground">
              Calendar ID: {String(calendarIntegration.config.calendarId)}
            </span>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Calendar</CardTitle>
          <CardDescription>
            Google-style calendar view of your live appointments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasActiveCalendar ? (
            <EmptyState
              icon={CalendarIcon}
              title="Calendar not connected"
              description="Connect Google Calendar in Clinic Setup to view appointments here."
            >
              <Button asChild variant="outline">
                <a href="/dashboard/ai-receptionist">Go to Clinic Setup</a>
              </Button>
            </EmptyState>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading calendar events...</p>
          ) : error ? (
            <EmptyState
              icon={CalendarIcon}
              title="Unable to load appointments"
              description={errorMessage
                ? `Calendar connected but events failed to load. ${errorMessage}`
                : 'Calendar connected but events failed to load. Reconnect Google Calendar and try again.'}
            >
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
                <Button asChild variant="outline">
                  <a href="/dashboard/ai-receptionist">Reconnect calendar</a>
                </Button>
              </div>
            </EmptyState>
          ) : (
            <div className="rounded-lg border p-2">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek,timeGridDay',
                }}
                events={calendarEvents}
                height="auto"
                nowIndicator
                eventDisplay="block"
                eventClick={(info) => {
                  info.jsEvent.preventDefault();
                  setSelectedEvent({
                    title: info.event.title,
                    start: info.event.start?.toISOString() ?? '',
                    end: info.event.end?.toISOString() ?? '',
                    status: String(info.event.extendedProps?.status ?? 'confirmed'),
                    description: String(info.event.extendedProps?.description ?? ''),
                    htmlLink: String(info.event.extendedProps?.htmlLink ?? ''),
                  });
                  setDialogOpen(true);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Schedule</CardTitle>
          <CardDescription>
            This view updates automatically when the AI receptionist books an appointment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasActiveCalendar ? (
            <EmptyState
              icon={CalendarIcon}
              title="Calendar not connected"
              description="Connect Google Calendar in Clinic Setup to view appointments here."
            >
              <Button asChild variant="outline">
                <a href="/dashboard/ai-receptionist">Go to Clinic Setup</a>
              </Button>
            </EmptyState>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading calendar events...</p>
          ) : error ? (
            <EmptyState
              icon={CalendarIcon}
              title="Unable to load appointments"
              description={errorMessage
                ? `Calendar connected but events failed to load. ${errorMessage}`
                : 'Calendar connected but events failed to load. Reconnect Google Calendar and try again.'}
            >
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
                <Button asChild variant="outline">
                  <a href="/dashboard/ai-receptionist">Reconnect calendar</a>
                </Button>
              </div>
            </EmptyState>
          ) : events.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="No upcoming appointments"
              description="New bookings created by the AI receptionist will appear here."
            />
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{event.summary}</h3>
                    <Badge variant="outline">{event.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(event.start)} → {formatDateTime(event.end)}
                  </p>
                  {event.description ? (
                    <p className="mt-2 text-sm">{event.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedEvent?.title ?? 'Appointment'}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedEvent ? 'Appointment details' : 'No appointment selected.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedEvent ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Time:</span>{' '}
                {formatDateTime(selectedEvent.start)} → {formatDateTime(selectedEvent.end)}
              </div>
              <div>
                <span className="font-medium text-foreground">Status:</span> {selectedEvent.status}
              </div>
              {selectedEvent.description ? (
                <div>
                  <span className="font-medium text-foreground">Details:</span> {selectedEvent.description}
                </div>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            {selectedEvent?.htmlLink ? (
              <AlertDialogAction asChild>
                <a href={selectedEvent.htmlLink} target="_blank" rel="noreferrer">
                  Open in Google Calendar
                </a>
              </AlertDialogAction>
            ) : null}
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
