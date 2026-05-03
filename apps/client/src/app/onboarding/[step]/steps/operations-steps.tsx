import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { WEEKDAYS } from '@/features/aiConfig/schedule';
import { useDeleteIntegrationMutation, useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function PhoneNumberStep({ flow }: { flow: OnboardingFlow }) {
  const hasIncomingNumbers = flow.twilioIncomingNumbers.length > 0;
  const debugInspectorUrl = flow.telephonyWebhookBase
    ? `${flow.telephonyWebhookBase.replace(/\/$/, '')}/api/telephony/webhook/voice`
    : '';

  return (
    <Card className="border bg-card/95 shadow-sm rounded-3xl">
      <CardHeader>
        <CardTitle className="text-xl">Clinic phone number</CardTitle>
        <CardDescription>Select one Twilio number for this clinic. You can change it later from settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {flow.activeAssignedNumber ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              Active number: {flow.activeAssignedNumber.phoneNumber}
            </div>
          ) : null}

          <Field>
            <FieldLabel>Available Twilio numbers</FieldLabel>
            {hasIncomingNumbers ? (
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={flow.selectedPhoneNumber}
                onChange={(event) => flow.setSelectedPhoneNumber(event.target.value)}
              >
                {flow.twilioIncomingNumbers.map((number) => (
                  <option key={number.sid} value={number.phoneNumber}>
                    {number.phoneNumber}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">No purchased Twilio numbers found in this account yet.</p>
            )}
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
            <Button
              variant="outline"
              className="min-w-32"
              onClick={() => flow.goNext('integrations')}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-w-44"
              disabled={!debugInspectorUrl}
              onClick={() => {
                if (!debugInspectorUrl) return;
                window.open(debugInspectorUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              Open Webhook Debug
            </Button>
            <Button
              className="min-w-40"
              disabled={!flow.selectedPhoneNumber || !hasIncomingNumbers || flow.assigningPhoneNumber}
              onClick={async () => {
                try {
                  const selected = flow.twilioIncomingNumbers.find(
                    (number) => number.phoneNumber === flow.selectedPhoneNumber,
                  );
                  if (!selected) {
                    toast.error('Select a valid Twilio number');
                    return;
                  }
                  await flow.assignTelephonyNumber({
                    phoneNumber: selected.phoneNumber,
                    twilioSid: selected.sid,
                    friendlyName: selected.friendlyName ?? selected.phoneNumber,
                  }).unwrap();
                  toast.success('Phone number assigned');
                  flow.goNext('integrations');
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
            >
              {flow.assigningPhoneNumber ? 'Assigning...' : 'Assign number'}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

export function IntegrationsStep({ flow }: { flow: OnboardingFlow }) {
  const { data: integrationsData } = useGetIntegrationsQuery();
  const [deleteIntegration, { isLoading: isRemovingIntegration }] = useDeleteIntegrationMutation();
  const googleIntegration = integrationsData?.data?.find(
    (integration) => integration.integrationType === 'calendar' && integration.provider === 'google_calendar',
  );
  const isCalendarConnected = Boolean(googleIntegration);

  return (
    <Card className="border bg-card/95 shadow-sm rounded-3xl">
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
            {isCalendarConnected && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                Google Calendar is connected. Continue to clinic hours.
              </div>
            )}
            {googleIntegration && (
              <Button
                type="button"
                variant="outline"
                className="min-w-40"
                disabled={isRemovingIntegration}
                onClick={async () => {
                  const confirmed = window.confirm('Remove Google Calendar connection? This will stop live booking until reconnected.');
                  if (!confirmed) return;
                  try {
                    await deleteIntegration(googleIntegration.id).unwrap();
                    toast.success('Google Calendar connection removed');
                  } catch (error: unknown) {
                    toast.error(getUserFriendlyApiError(error));
                  }
                }}
              >
                {isRemovingIntegration ? 'Removing...' : 'Remove connection'}
              </Button>
            )}
            <Button onClick={() => flow.goNext('schedule')} variant="outline" className="min-w-32" type="button">
              {isCalendarConnected ? 'Continue' : 'Skip for now'}
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
    <Card className="border bg-card/95 shadow-sm rounded-3xl">
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
