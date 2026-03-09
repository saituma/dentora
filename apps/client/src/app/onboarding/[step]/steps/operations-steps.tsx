import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { WEEKDAYS } from '@/features/aiConfig/schedule';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function RulesStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Appointment rules</CardTitle>
        <CardDescription>Set booking policies your AI should always follow</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Default duration (min)</FieldLabel>
            <Input type="number" value={flow.defaultDuration} onChange={(event) => flow.setDefaultDuration(Number(event.target.value))} />
          </Field>
          <Field>
            <FieldLabel>Advance booking (days)</FieldLabel>
            <Input type="number" value={flow.advanceBookingDays} onChange={(event) => flow.setAdvanceBookingDays(Number(event.target.value))} />
          </Field>
          <Field>
            <FieldLabel>Cancellation notice (hours)</FieldLabel>
            <Input type="number" value={flow.cancellationHours} onChange={(event) => flow.setCancellationHours(Number(event.target.value))} />
          </Field>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
            <Button
              disabled={flow.savingRules}
              onClick={async () => {
                try {
                  await flow.saveBookingRules({
                    advanceBookingDays: flow.advanceBookingDays,
                    cancellationHours: flow.cancellationHours,
                    defaultAppointmentDurationMinutes: flow.defaultDuration,
                  }).unwrap();
                  await flow.savePolicies({
                    policies: [
                      { policyType: 'escalation', content: 'Escalate to a human team member when the caller asks for clinical advice, has unresolved billing disputes, or requests manager intervention.' },
                      { policyType: 'emergency', content: 'If the caller reports severe pain, bleeding, trauma, or breathing issues, instruct them to call 911 immediately and notify the on-call staff.' },
                    ],
                  }).unwrap();
                  toast.success('Booking rules saved');
                  flow.goNext('integrations');
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
              className="min-w-28"
            >
              {flow.savingRules ? 'Saving...' : 'Next'}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

export function IntegrationsStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Integrations</CardTitle>
        <CardDescription>Connect your calendar, then define the exact hours and breaks your AI can book into.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Google account email (optional)</FieldLabel>
            <Input type="email" placeholder="frontdesk@clinic.com" value={flow.googleCalendarEmail} onChange={(event) => flow.setGoogleCalendarEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Calendar ID</FieldLabel>
            <Input placeholder="primary" value={flow.googleCalendarId} onChange={(event) => flow.setGoogleCalendarId(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
            {flow.calendarConnected && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                Google Calendar is connected. Continue to clinic hours.
              </div>
            )}
            <Button onClick={() => flow.goNext('schedule')} variant="outline" className="min-w-32" type="button">
              {flow.calendarConnected ? 'Continue' : 'Skip for now'}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await flow.connectGoogleCalendar();
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
              className="min-w-44"
              disabled={flow.startingGoogleOAuth}
            >
              {flow.startingGoogleOAuth ? 'Redirecting...' : 'Connect Google Calendar'}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

export function ScheduleStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Clinic schedule</CardTitle>
        <CardDescription>Set the actual days, opening hours, and break times your AI receptionist must respect when offering appointments.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">Weekly working hours</h3>
              <p className="text-sm text-muted-foreground">Turn days on or off, then set opening and closing times. Add one break window per day for lunch or staff-only time.</p>
            </div>
            <div className="space-y-3">
              {WEEKDAYS.map((day) => {
                const row = flow.schedule[day.key];
                return (
                  <div key={day.key} className="rounded-lg border bg-background p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <label className="flex items-center gap-3 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            flow.setSchedule((prev) => ({ ...prev, [day.key]: { ...prev[day.key], enabled: checked, hasBreak: checked ? prev[day.key].hasBreak : false } }));
                          }}
                        />
                        {day.label}
                      </label>
                      <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Field><FieldLabel>Open</FieldLabel><Input type="time" value={row.start} disabled={!row.enabled} onChange={(event) => flow.setSchedule((prev) => ({ ...prev, [day.key]: { ...prev[day.key], start: event.target.value } }))} /></Field>
                        <Field><FieldLabel>Close</FieldLabel><Input type="time" value={row.end} disabled={!row.enabled} onChange={(event) => flow.setSchedule((prev) => ({ ...prev, [day.key]: { ...prev[day.key], end: event.target.value } }))} /></Field>
                        <Field><FieldLabel>Break start</FieldLabel><Input type="time" value={row.breakStart} disabled={!row.enabled || !row.hasBreak} onChange={(event) => flow.setSchedule((prev) => ({ ...prev, [day.key]: { ...prev[day.key], breakStart: event.target.value } }))} /></Field>
                        <Field><FieldLabel>Break end</FieldLabel><Input type="time" value={row.breakEnd} disabled={!row.enabled || !row.hasBreak} onChange={(event) => flow.setSchedule((prev) => ({ ...prev, [day.key]: { ...prev[day.key], breakEnd: event.target.value } }))} /></Field>
                      </div>
                    </div>
                    <label className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={row.hasBreak}
                        disabled={!row.enabled}
                        onChange={(event) => flow.setSchedule((prev) => ({ ...prev, [day.key]: { ...prev[day.key], hasBreak: event.target.checked } }))}
                      />
                      This day has a break window
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <Field>
            <FieldLabel>Closed dates</FieldLabel>
            <Textarea rows={4} value={flow.closedDatesText} onChange={(event) => flow.setClosedDatesText(event.target.value)} placeholder={'2026-12-25\n2026-12-26'} />
            <p className="mt-2 text-sm text-muted-foreground">Add one `YYYY-MM-DD` date per line for holidays, training days, or any one-off closures.</p>
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
            <Button
              disabled={flow.savingRules}
              onClick={async () => {
                const enabledDays = WEEKDAYS.filter((day) => flow.schedule[day.key].enabled);
                if (enabledDays.length === 0) {
                  toast.error('Enable at least one working day');
                  return;
                }
                for (const day of enabledDays) {
                  const row = flow.schedule[day.key];
                  if (!row.start || !row.end || row.start >= row.end) {
                    toast.error(`Check the working hours for ${day.label}`);
                    return;
                  }
                  if (row.hasBreak) {
                    if (!row.breakStart || !row.breakEnd || row.breakStart >= row.breakEnd) {
                      toast.error(`Check the break hours for ${day.label}`);
                      return;
                    }
                    if (row.breakStart <= row.start || row.breakEnd >= row.end) {
                      toast.error(`Break on ${day.label} must stay inside clinic hours`);
                      return;
                    }
                  }
                }
                try {
                  await flow.saveBookingRules({
                    operatingSchedule: flow.toBreakableSchedulePayload(flow.schedule),
                    closedDates: flow.parseClosedDatesText(flow.closedDatesText),
                  }).unwrap();
                  toast.success('Clinic schedule saved');
                  flow.goNext('ai-chat');
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
              className="min-w-32"
            >
              {flow.savingRules ? 'Saving...' : 'Save schedule'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
