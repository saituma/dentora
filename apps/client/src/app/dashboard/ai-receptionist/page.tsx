'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2Icon, PlusIcon, TrashIcon, LinkIcon } from 'lucide-react';
import { getUserFriendlyApiError } from '@/lib/api-error';
import {
  useGetVoiceProfileQuery,
  useUpdateVoiceProfileMutation,
  useGetServicesQuery,
  useAddServiceMutation,
  useDeleteServiceMutation,
  useGetFaqsQuery,
  useAddFaqMutation,
  useDeleteFaqMutation,
  useGetBookingRulesQuery,
  useUpdateBookingRulesMutation,
  useGetPoliciesQuery,
  useAddPolicyMutation,
  useDeletePolicyMutation,
} from '@/features/aiConfig/aiConfigApi';
import {
  useGenerateVoicePreviewMutation,
  useGetAvailableVoicesQuery,
} from '@/features/onboarding/onboardingApi';
import { useGetClinicQuery, useUpdateClinicMutation } from '@/features/clinic/clinicApi';
import {
  useGetIntegrationsQuery,
  useStartGoogleCalendarOAuthMutation,
} from '@/features/integrations/integrationsApi';

type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

type ScheduleRow = {
  enabled: boolean;
  start: string;
  end: string;
};

const WEEKDAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const DEFAULT_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'London' },
];

const DEFAULT_SCHEDULE: Record<WeekdayKey, ScheduleRow> = {
  monday: { enabled: true, start: '09:00', end: '17:00' },
  tuesday: { enabled: true, start: '09:00', end: '17:00' },
  wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '09:00', end: '13:00' },
  sunday: { enabled: false, start: '09:00', end: '13:00' },
};

export default function AiReceptionistPage() {
  const { data: clinic, isLoading: clinicLoading } = useGetClinicQuery();
  const { data: voiceProfile, isLoading: voiceLoading } = useGetVoiceProfileQuery();
  const { data: bookingRules, isLoading: bookingLoading } = useGetBookingRulesQuery();
  const { data: integrationsData } = useGetIntegrationsQuery();
  const { data: voicesData, isLoading: voicesLoading } = useGetAvailableVoicesQuery();

  const [updateClinic, { isLoading: clinicSaving }] = useUpdateClinicMutation();
  const [updateRules, { isLoading: rulesSaving }] = useUpdateBookingRulesMutation();
  const [updateVoice, { isLoading: voiceSaving }] = useUpdateVoiceProfileMutation();
  const [generateVoicePreview, { isLoading: previewGenerating }] = useGenerateVoicePreviewMutation();
  const [startGoogleCalendarOAuth, { isLoading: connectingCalendar }] = useStartGoogleCalendarOAuthMutation();

  const { data: servicesData, isLoading: servicesLoading } = useGetServicesQuery();
  const services = servicesData?.data ?? [];
  const [addService, { isLoading: addingService }] = useAddServiceMutation();
  const [deleteService] = useDeleteServiceMutation();

  const { data: faqsData, isLoading: faqsLoading } = useGetFaqsQuery();
  const faqs = faqsData?.data ?? [];
  const [addFaq, { isLoading: addingFaq }] = useAddFaqMutation();
  const [deleteFaq] = useDeleteFaqMutation();

  const { data: policiesData, isLoading: policiesLoading } = useGetPoliciesQuery();
  const policies = policiesData?.data ?? [];
  const [addPolicy, { isLoading: addingPolicy }] = useAddPolicyMutation();
  const [deletePolicy] = useDeletePolicyMutation();

  const [clinicName, setClinicName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [schedule, setSchedule] = useState<Record<WeekdayKey, ScheduleRow>>(DEFAULT_SCHEDULE);
  const [closedDatesText, setClosedDatesText] = useState('');
  const [defaultDuration, setDefaultDuration] = useState('30');
  const [bufferMinutes, setBufferMinutes] = useState('0');
  const [minNotice, setMinNotice] = useState('2');
  const [maxAdvance, setMaxAdvance] = useState('90');

  const [greeting, setGreeting] = useState('');
  const [afterHoursMessage, setAfterHoursMessage] = useState('');
  const [voiceId, setVoiceId] = useState('professional');
  const [tone, setTone] = useState<'friendly' | 'professional' | 'formal' | 'casual' | 'warm' | 'calm'>('professional');
  const [language, setLanguage] = useState('en-US');

  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('30');
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newPolicyType, setNewPolicyType] = useState('cancellation');
  const [newPolicyContent, setNewPolicyContent] = useState('');

  const availableVoices = voicesData?.data ?? [];
  const calendarIntegration = useMemo(() => (
    integrationsData?.data?.find((integration) => (
      integration.integrationType === 'calendar' && integration.provider === 'google_calendar'
    )) ?? null
  ), [integrationsData?.data]);

  useEffect(() => {
    if (clinic) {
      setClinicName(clinic.clinicName ?? '');
      setTimezone(clinic.timezone ?? 'America/New_York');
      setSchedule(toScheduleForm(clinic.businessHours, bookingRules?.operatingSchedule));
    }
  }, [clinic, bookingRules?.operatingSchedule]);

  useEffect(() => {
    if (bookingRules) {
      setDefaultDuration(String(bookingRules.defaultAppointmentDurationMinutes ?? 30));
      setBufferMinutes(String(bookingRules.bufferBetweenAppointmentsMinutes ?? 0));
      setMinNotice(String(bookingRules.minNoticePeriodHours ?? 2));
      setMaxAdvance(String(bookingRules.maxAdvanceBookingDays ?? 90));
      setClosedDatesText((bookingRules.closedDates ?? []).join('\n'));
      setSchedule((current) => toScheduleForm(clinic?.businessHours, bookingRules.operatingSchedule, current));
    }
  }, [bookingRules, clinic?.businessHours]);

  useEffect(() => {
    if (voiceProfile) {
      setGreeting(voiceProfile.greetingMessage ?? '');
      setAfterHoursMessage(voiceProfile.afterHoursMessage ?? '');
      setVoiceId(voiceProfile.voiceId ?? 'professional');
      setTone(voiceProfile.tone ?? 'professional');
      setLanguage(voiceProfile.language ?? 'en-US');
    }
  }, [voiceProfile]);

  const handleSaveClinicSetup = async () => {
    const schedulePayload = toSchedulePayload(schedule);
    const closedDates = parseClosedDatesText(closedDatesText);

    try {
      await Promise.all([
        updateClinic({
          clinicName,
          timezone,
          businessHours: schedulePayload,
        }).unwrap(),
        updateRules({
          operatingSchedule: schedulePayload,
          closedDates,
          defaultAppointmentDurationMinutes: parseInt(defaultDuration, 10) || 30,
          bufferBetweenAppointmentsMinutes: parseInt(bufferMinutes, 10) || 0,
          minNoticePeriodHours: parseInt(minNotice, 10) || 2,
          maxAdvanceBookingDays: parseInt(maxAdvance, 10) || 90,
        }).unwrap(),
      ]);
      toast.success('Clinic booking configuration saved');
    } catch {
      toast.error('Failed to save clinic booking configuration');
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const result = await startGoogleCalendarOAuth({}).unwrap();
      window.location.href = result.authUrl;
    } catch {
      toast.error('Failed to start Google Calendar connection');
    }
  };

  const handlePreviewVoice = async () => {
    try {
      const audioUrl = await generateVoicePreview({
        voiceId,
        text: greeting.trim() || `Hello, thank you for calling ${clinicName || 'our clinic'}. How may I help you today?`,
        speed: voiceProfile?.speechSpeed ?? 1,
        language,
      }).unwrap();
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const handleSaveVoice = async () => {
    try {
      await updateVoice({
        greetingMessage: greeting,
        afterHoursMessage,
        voiceId,
        tone,
        language,
      }).unwrap();
      toast.success('Voice profile saved');
    } catch {
      toast.error('Failed to save voice profile');
    }
  };

  const handleAddService = async () => {
    if (!newServiceName.trim()) return;
    try {
      await addService({
        serviceName: newServiceName,
        durationMinutes: parseInt(newServiceDuration, 10) || 30,
        isActive: true,
      }).unwrap();
      setNewServiceName('');
      setNewServiceDuration('30');
      toast.success('Service added');
    } catch {
      toast.error('Failed to add service');
    }
  };

  const handleAddFaq = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      await addFaq({ question: newQuestion, answer: newAnswer }).unwrap();
      setNewQuestion('');
      setNewAnswer('');
      toast.success('FAQ added');
    } catch {
      toast.error('Failed to add FAQ');
    }
  };

  const handleAddPolicy = async () => {
    if (!newPolicyContent.trim()) return;
    try {
      await addPolicy({ policyType: newPolicyType, content: newPolicyContent }).unwrap();
      setNewPolicyContent('');
      toast.success('Policy added');
    } catch {
      toast.error('Failed to add policy');
    }
  };

  const saveLoading = clinicSaving || rulesSaving;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">AI Receptionist Setup</h2>
        <p className="text-sm text-muted-foreground">
          Configure booking rules, calendar connection, and ElevenLabs voice selection for your clinic receptionist.
        </p>
      </div>

      <Tabs defaultValue="clinic" className="space-y-6">
        <TabsList>
          <TabsTrigger value="clinic">Clinic Setup</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="voice" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ElevenLabs voice</CardTitle>
              <CardDescription>
                Choose the receptionist voice dynamically from ElevenLabs and use it for previews and live test calls.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {voiceLoading || voicesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel>Greeting message</FieldLabel>
                    <Textarea
                      rows={3}
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                      placeholder="Hello, thank you for calling. How can I help you today?"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Selected voice</FieldLabel>
                    <Select value={voiceId} onValueChange={(value) => setVoiceId(value || 'professional')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Default professional voice</SelectItem>
                        {availableVoices.map((voice) => (
                          <SelectItem key={voice.voiceId} value={voice.voiceId}>
                            {voice.name}{voice.label ? ` - ${voice.label}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Tone</FieldLabel>
                      <Select value={tone} onValueChange={(value) => setTone((value as typeof tone) || 'professional')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="warm">Warm</SelectItem>
                          <SelectItem value="calm">Calm</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Language</FieldLabel>
                      <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en-US" />
                    </Field>
                  </div>

                  <Field>
                    <FieldLabel>After-hours message</FieldLabel>
                    <Textarea
                      rows={2}
                      value={afterHoursMessage}
                      onChange={(e) => setAfterHoursMessage(e.target.value)}
                      placeholder="We are currently closed. Please leave a message and our team will return your call."
                    />
                  </Field>

                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={handlePreviewVoice} disabled={previewGenerating}>
                      {previewGenerating ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                      Preview voice
                    </Button>
                    <Button onClick={handleSaveVoice} disabled={voiceSaving}>
                      {voiceSaving ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                      Save voice profile
                    </Button>
                  </div>
                </FieldGroup>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>
                Active services the receptionist can book.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="Service name" className="flex-1" />
                <Input value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} placeholder="Minutes" type="number" className="w-28" />
                <Button onClick={handleAddService} disabled={addingService}>
                  <PlusIcon className="mr-1 size-4" />
                  Add
                </Button>
              </div>

              {servicesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : services.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No services configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{service.serviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {service.durationMinutes ? `${service.durationMinutes} min` : 'Duration not set'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          try {
                            await deleteService(service.id).unwrap();
                            toast.success('Service removed');
                          } catch {
                            toast.error('Failed to remove service');
                          }
                        }}
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faqs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>FAQs</CardTitle>
              <CardDescription>
                Common clinic information the receptionist can answer without asking staff.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FieldGroup>
                <Field>
                  <FieldLabel>Question</FieldLabel>
                  <Input value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Do you accept new patients?" />
                </Field>
                <Field>
                  <FieldLabel>Answer</FieldLabel>
                  <Textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} rows={2} placeholder="Yes, we are currently accepting new patients." />
                </Field>
                <Button onClick={handleAddFaq} disabled={addingFaq}>
                  <PlusIcon className="mr-1 size-4" />
                  Add FAQ
                </Button>
              </FieldGroup>

              {faqsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : faqs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No FAQs configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {faqs.map((faq) => (
                    <div key={faq.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{faq.question}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{faq.answer}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              await deleteFaq(faq.id).unwrap();
                              toast.success('FAQ removed');
                            } catch {
                              toast.error('Failed to remove FAQ');
                            }
                          }}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>
                Patient-facing policy snippets the receptionist should communicate during calls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FieldGroup>
                <Field>
                  <FieldLabel>Policy type</FieldLabel>
                  <Select value={newPolicyType} onValueChange={(value) => setNewPolicyType(value || 'cancellation')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cancellation">Cancellation</SelectItem>
                      <SelectItem value="no_show">No-show</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Content</FieldLabel>
                  <Textarea value={newPolicyContent} onChange={(e) => setNewPolicyContent(e.target.value)} rows={2} placeholder="Please cancel at least 24 hours in advance." />
                </Field>
                <Button onClick={handleAddPolicy} disabled={addingPolicy}>
                  <PlusIcon className="mr-1 size-4" />
                  Add policy
                </Button>
              </FieldGroup>

              {policiesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : policies.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No policies configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {policies.map((policy) => (
                    <div key={policy.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline" className="mb-1 capitalize">
                            {policy.policyType.replace(/_/g, ' ')}
                          </Badge>
                          <p className="text-sm text-muted-foreground">{policy.content || 'Policy details are stored in structured fields.'}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              await deletePolicy(policy.id).unwrap();
                              toast.success('Policy removed');
                            } catch {
                              toast.error('Failed to remove policy');
                            }
                          }}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function toScheduleForm(
  clinicHours?: Record<string, unknown>,
  bookingSchedule?: Record<string, unknown>,
  current?: Record<WeekdayKey, ScheduleRow>,
): Record<WeekdayKey, ScheduleRow> {
  const source = bookingSchedule ?? clinicHours ?? {};
  const base = current ?? DEFAULT_SCHEDULE;
  if (Object.keys(source).length === 0) {
    return { ...base };
  }
  const next = { ...base };

  for (const day of WEEKDAYS) {
    const rawValue = source?.[day.key];
    if (!rawValue || typeof rawValue !== 'object') {
      next[day.key] = { ...base[day.key], enabled: false };
      continue;
    }

    const entry = rawValue as { start?: unknown; end?: unknown };
    if (typeof entry.start === 'string' && typeof entry.end === 'string') {
      next[day.key] = {
        enabled: true,
        start: entry.start,
        end: entry.end,
      };
    }
  }

  return next;
}

function toSchedulePayload(schedule: Record<WeekdayKey, ScheduleRow>): Record<string, { start: string; end: string } | null> {
  return WEEKDAYS.reduce<Record<string, { start: string; end: string } | null>>((acc, day) => {
    const value = schedule[day.key];
    acc[day.key] = value.enabled
      ? { start: value.start, end: value.end }
      : null;
    return acc;
  }, {});
}

function parseClosedDatesText(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
