'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetClinicQuery, useUpdateClinicMutation } from '@/features/clinic/clinicApi';
import { PageHeader } from '@/components/page-header';

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const;

type DayKey = (typeof DAYS)[number]['key'];

interface DayState {
  open: boolean;
  start: string;
  end: string;
}

type HoursState = Record<DayKey, DayState>;

function defaultHours(): HoursState {
  return {
    monday: { open: false, start: '09:00', end: '17:30' },
    tuesday: { open: false, start: '09:00', end: '17:30' },
    wednesday: { open: false, start: '09:00', end: '17:30' },
    thursday: { open: false, start: '09:00', end: '17:30' },
    friday: { open: false, start: '09:00', end: '17:30' },
    saturday: { open: false, start: '09:00', end: '17:30' },
    sunday: { open: false, start: '09:00', end: '17:30' },
  };
}

function hoursFromClinic(
  businessHours: Record<string, { start: string; end: string } | null> | undefined,
): HoursState {
  const base = defaultHours();
  if (!businessHours) return base;
  for (const day of DAYS) {
    const val = businessHours[day.key];
    if (val && val.start && val.end) {
      base[day.key] = { open: true, start: val.start, end: val.end };
    } else {
      base[day.key] = { open: false, start: base[day.key].start, end: base[day.key].end };
    }
  }
  return base;
}

const WEEKDAYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const WEEKEND: DayKey[] = ['saturday', 'sunday'];

export default function OpeningHoursPage() {
  const { data: clinic, isLoading } = useGetClinicQuery();
  const [updateClinic] = useUpdateClinicMutation();

  const [hours, setHours] = useState<HoursState>(defaultHours);

  useEffect(() => {
    if (clinic) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHours(hoursFromClinic(clinic.businessHours));
    }
  }, [clinic]);

  const setDay = (day: DayKey, patch: Partial<DayState>) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  };

  const applyQuickSet = (days: DayKey[], start: string, end: string, open: boolean) => {
    setHours((prev) => {
      const next = { ...prev };
      for (const day of days) {
        next[day] = {
          open,
          start: open ? start : prev[day].start,
          end: open ? end : prev[day].end,
        };
      }
      return next;
    });
  };

  const handleSave = () => {
    const businessHours: Record<string, { start: string; end: string } | null> = {};
    for (const day of DAYS) {
      const d = hours[day.key];
      businessHours[day.key] = d.open ? { start: d.start, end: d.end } : null;
    }
    toast.promise(updateClinic({ businessHours }).unwrap(), {
      loading: 'Saving opening hours…',
      success: 'Opening hours saved',
      error: 'Failed to save opening hours',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Opening Hours"
        subtitle="Set when the clinic is open. The AI uses these to check if the clinic is open when patients call and to offer bookings."
        actions={
          <Button type="button" onClick={handleSave} disabled={isLoading}>
            Save
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>
              Toggle each day open or closed and set the hours. Changes take effect after saving.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyQuickSet(WEEKDAYS, '09:00', '17:30', true)}
            >
              Weekdays 9–5:30
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyQuickSet(WEEKDAYS, '09:00', '18:00', true)}
            >
              Weekdays 9–6
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyQuickSet(WEEKEND, '09:00', '17:30', false)}
            >
              Close weekends
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-9 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {DAYS.map(({ key, label }) => {
                const day = hours[key];
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <Label
                      htmlFor={`switch-${key}`}
                      className="w-24 min-w-[6rem] font-medium cursor-pointer"
                    >
                      {label}
                    </Label>
                    <Switch
                      id={`switch-${key}`}
                      checked={day.open}
                      onCheckedChange={(checked) => setDay(key, { open: checked })}
                    />
                    <span className="text-muted-foreground text-sm w-12">
                      {day.open ? 'Open' : 'Closed'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={day.start}
                        disabled={!day.open}
                        onChange={(e) => setDay(key, { start: e.target.value })}
                        className="w-32 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        type="time"
                        value={day.end}
                        disabled={!day.open}
                        onChange={(e) => setDay(key, { end: e.target.value })}
                        className="w-32 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </div>
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
