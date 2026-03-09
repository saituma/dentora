'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2Icon, LinkIcon } from 'lucide-react';
import { DEFAULT_TIMEZONES, WEEKDAYS, type ScheduleRow, type WeekdayKey } from '@/features/aiConfig/schedule';

export function ClinicSetupTab(props: {
  clinicLoading: boolean;
  bookingLoading: boolean;
  clinicName: string;
  setClinicName: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  defaultDuration: string;
  setDefaultDuration: (value: string) => void;
  bufferMinutes: string;
  setBufferMinutes: (value: string) => void;
  minNotice: string;
  setMinNotice: (value: string) => void;
  maxAdvance: string;
  setMaxAdvance: (value: string) => void;
  schedule: Record<WeekdayKey, ScheduleRow>;
  setSchedule: React.Dispatch<React.SetStateAction<Record<WeekdayKey, ScheduleRow>>>;
  closedDatesText: string;
  setClosedDatesText: (value: string) => void;
  calendarIntegration: { status?: string; provider?: string } | null;
  connectingCalendar: boolean;
  handleConnectCalendar: () => Promise<void>;
  handleSaveClinicSetup: () => Promise<void>;
  saveLoading: boolean;
}) {
  const {
    clinicLoading,
    bookingLoading,
    clinicName,
    setClinicName,
    timezone,
    setTimezone,
    defaultDuration,
    setDefaultDuration,
    bufferMinutes,
    setBufferMinutes,
    minNotice,
    setMinNotice,
    maxAdvance,
    setMaxAdvance,
    schedule,
    setSchedule,
    closedDatesText,
    setClosedDatesText,
    calendarIntegration,
    connectingCalendar,
    handleConnectCalendar,
    handleSaveClinicSetup,
    saveLoading,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking configuration</CardTitle>
        <CardDescription>
          Define clinic hours, closed dates, appointment duration, and the live Google Calendar connection used for bookings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clinicLoading || bookingLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Clinic name</FieldLabel>
                <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Timezone</FieldLabel>
                <Select value={timezone} onValueChange={(value) => setTimezone(value || 'America/New_York')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_TIMEZONES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Field>
                <FieldLabel>Appointment duration</FieldLabel>
                <Input type="number" value={defaultDuration} onChange={(e) => setDefaultDuration(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Buffer between appointments</FieldLabel>
                <Input type="number" value={bufferMinutes} onChange={(e) => setBufferMinutes(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Minimum notice (hours)</FieldLabel>
                <Input type="number" value={minNotice} onChange={(e) => setMinNotice(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Max advance booking (days)</FieldLabel>
                <Input type="number" value={maxAdvance} onChange={(e) => setMaxAdvance(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-3">
              <FieldLabel>Working schedule</FieldLabel>
              {WEEKDAYS.map((day) => (
                <div key={day.key} className="grid grid-cols-[140px_120px_120px_1fr] items-center gap-3 rounded-lg border p-3">
                  <Button
                    type="button"
                    variant={schedule[day.key].enabled ? 'default' : 'outline'}
                    onClick={() => {
                      setSchedule((current) => ({
                        ...current,
                        [day.key]: {
                          ...current[day.key],
                          enabled: !current[day.key].enabled,
                        },
                      }));
                    }}
                  >
                    {schedule[day.key].enabled ? `${day.label} open` : `${day.label} closed`}
                  </Button>
                  <Input
                    type="time"
                    value={schedule[day.key].start}
                    disabled={!schedule[day.key].enabled}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSchedule((current) => ({
                        ...current,
                        [day.key]: { ...current[day.key], start: value },
                      }));
                    }}
                  />
                  <Input
                    type="time"
                    value={schedule[day.key].end}
                    disabled={!schedule[day.key].enabled}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSchedule((current) => ({
                        ...current,
                        [day.key]: { ...current[day.key], end: value },
                      }));
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {schedule[day.key].enabled
                      ? `${schedule[day.key].start} to ${schedule[day.key].end}`
                      : 'No appointments'}
                  </span>
                </div>
              ))}
            </div>

            <Field>
              <FieldLabel>Closed dates</FieldLabel>
              <Textarea
                rows={4}
                value={closedDatesText}
                onChange={(e) => setClosedDatesText(e.target.value)}
                placeholder={'One date per line\n2026-12-25\n2026-12-26'}
              />
            </Field>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Google Calendar</p>
                  <p className="text-sm text-muted-foreground">
                    Real appointment availability and bookings are validated against this calendar.
                  </p>
                </div>
                <Badge variant={calendarIntegration?.status === 'active' ? 'default' : 'secondary'}>
                  {calendarIntegration?.status === 'active' ? 'Connected' : 'Not connected'}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConnectCalendar}
                  disabled={connectingCalendar}
                >
                  {connectingCalendar ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <LinkIcon className="mr-2 size-4" />}
                  {calendarIntegration ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
                </Button>
                {calendarIntegration && (
                  <span className="text-sm text-muted-foreground">
                    Provider: {calendarIntegration.provider}
                  </span>
                )}
              </div>
            </div>

            <Button onClick={handleSaveClinicSetup} disabled={saveLoading}>
              {saveLoading ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save clinic setup'
              )}
            </Button>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
