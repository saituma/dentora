import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PhoneIcon, CalendarIcon, ArrowRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from './dashboard-utils';

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'bg-success'
      : status === 'in_progress'
        ? 'bg-primary animate-pulse'
        : status === 'escalated'
          ? 'bg-warning'
          : 'bg-destructive';
  return <span className={cn('inline-block size-2 rounded-full', color)} />;
}

interface CallItem {
  id: string;
  callerNumber?: string | null;
  startedAt: string;
  status: string;
  durationSeconds?: number | null;
}

interface AppointmentEvent {
  id: string;
  summary?: string | null;
  start: string;
  end: string;
  status: string;
}

interface Props {
  callsLoading: boolean;
  recentCalls: CallItem[];
  upcomingLoading: boolean;
  upcomingEvents: AppointmentEvent[];
  hasActiveCalendar: boolean;
}

export function DashboardActivityRow({
  callsLoading,
  recentCalls,
  upcomingLoading,
  upcomingEvents,
  hasActiveCalendar,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Recent Calls */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PhoneIcon className="size-4 text-primary" />
              Recent calls
            </CardTitle>
            <CardDescription>Latest AI receptionist sessions</CardDescription>
          </div>
          <Button variant="ghost" size="sm" render={<Link href="/dashboard/calls" />}>
            View all <ArrowRightIcon className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {callsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No calls yet — your AI receptionist is ready
            </div>
          ) : (
            <div className="space-y-1">
              {recentCalls.map((call) => (
                <Link
                  key={call.id}
                  href={`/dashboard/calls/${call.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <PhoneIcon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{call.callerNumber || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(call.startedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={call.status} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDuration(call.durationSeconds)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-primary" />
              Upcoming appointments
            </CardTitle>
            <CardDescription>Next 7 days</CardDescription>
          </div>
          <Button variant="ghost" size="sm" render={<Link href="/dashboard/appointments" />}>
            View all <ArrowRightIcon className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {!hasActiveCalendar ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CalendarIcon className="size-8 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">No calendar connected</p>
                <p className="text-xs text-muted-foreground">
                  Connect Google Calendar to see appointments
                </p>
              </div>
              <Button variant="outline" size="sm" render={<Link href="/dashboard/integrations" />}>
                Connect
              </Button>
            </div>
          ) : upcomingLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No upcoming appointments
            </div>
          ) : (
            <div className="space-y-1">
              {upcomingEvents.slice(0, 5).map((event) => {
                const start = new Date(event.start);
                const end = new Date(event.end);
                const isToday = start.toDateString() === new Date().toDateString();
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const isTomorrow = start.toDateString() === tomorrow.toDateString();
                const dayLabel = isToday
                  ? 'Today'
                  : isTomorrow
                    ? 'Tomorrow'
                    : start.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      });
                const timeLabel = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2.5',
                      isToday && 'bg-primary/5 border border-primary/10',
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">{event.summary || 'Appointment'}</p>
                      <p className="text-xs text-muted-foreground">
                        {dayLabel} &middot; {timeLabel}
                      </p>
                    </div>
                    <Badge
                      variant={event.status === 'confirmed' ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {event.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
