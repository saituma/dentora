'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  DEFAULT_SCHEDULE,
  parseClosedDatesText,
  toScheduleForm,
  toSchedulePayload,
  type ScheduleRow,
  type WeekdayKey,
} from '@/features/aiConfig/schedule';
import { ClinicSetupTab } from '@/app/dashboard/ai-receptionist/clinic-setup-tab';
import { ClinicInfoTab } from '@/app/dashboard/ai-receptionist/clinic-info-tab';
import { VoiceTab } from '@/app/dashboard/ai-receptionist/voice-tab';
import {
  FaqsTab,
  PoliciesTab,
  ServicesTab,
} from '@/app/dashboard/ai-receptionist/resource-tabs';
import { useSaveContextDocumentsMutation } from '@/features/onboarding/onboardingApi';

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
  const [saveContextDocuments, { isLoading: savingContext }] = useSaveContextDocumentsMutation();

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
  const [staffDirectory, setStaffDirectory] = useState('');
  const [clinicNotes, setClinicNotes] = useState('');

  const availableVoices = voicesData?.data ?? [];
  const selectedVoice = availableVoices.find((voice) => voice.voiceId === voiceId) ?? null;
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

  useEffect(() => {
    const policy = policiesData?.data?.[0];
    const contextDocs = (policy?.sensitiveTopics ?? [])
      .filter((topic) => topic?.type === 'context_document')
      .map((topic) => ({
        title: String(topic.title ?? ''),
        content: String(topic.content ?? ''),
      }));
    const staffDoc = contextDocs.find((doc) => doc.title === 'Staff Directory');
    const notesDoc = contextDocs.find((doc) => doc.title === 'Clinic Notes');
    if (staffDoc && !staffDirectory) setStaffDirectory(staffDoc.content);
    if (notesDoc && !clinicNotes) setClinicNotes(notesDoc.content);
  }, [policiesData?.data, staffDirectory, clinicNotes]);

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
      const result = await startGoogleCalendarOAuth({
        returnTo: window.location.href,
      }).unwrap();
      window.location.href = result.authUrl;
    } catch {
      toast.error('Failed to start Google Calendar connection');
    }
  };

  const handlePreviewVoice = async () => {
    try {
      const audioUrl = await generateVoicePreview({
        voiceId,
        text: greeting.trim() || `Hi, welcome to ${clinicName || 'our clinic'}, what can I help you with today?`,
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
      if (selectedVoice?.requiresPaidPlan) {
        toast.error('Choose a live-supported voice. This library voice needs a paid ElevenLabs plan for live call speech.');
        return;
      }

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

  const handleSaveClinicInfo = async (staffDirectoryOverride?: string) => {
    const staffValue = staffDirectoryOverride ?? staffDirectory;
    const policy = policiesData?.data?.[0];
    const existingDocs = (policy?.sensitiveTopics ?? [])
      .filter((topic) => topic?.type === 'context_document')
      .map((topic) => ({
        name: String(topic.title ?? ''),
        content: String(topic.content ?? ''),
        mimeType: String(topic.mimeType ?? 'text/plain'),
      }));
    const retained = existingDocs.filter((doc) => doc.name !== 'Staff Directory' && doc.name !== 'Clinic Notes');

    const documents = [
      ...retained,
      ...(staffValue.trim()
        ? [{ name: 'Staff Directory', content: staffValue.trim(), mimeType: 'text/plain' }]
        : []),
      ...(clinicNotes.trim()
        ? [{ name: 'Clinic Notes', content: clinicNotes.trim(), mimeType: 'text/plain' }]
        : []),
    ];

    if (documents.length === 0) {
      toast.error('Add staff details or clinic notes before saving.');
      return;
    }

    try {
      await saveContextDocuments({ documents }).unwrap();
      toast.success('Clinic info saved');
    } catch {
      toast.error('Failed to save clinic info');
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
          <TabsTrigger value="info">Clinic Info</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="space-y-6">
          <ClinicSetupTab
            clinicLoading={clinicLoading}
            bookingLoading={bookingLoading}
            clinicName={clinicName}
            setClinicName={setClinicName}
            timezone={timezone}
            setTimezone={setTimezone}
            defaultDuration={defaultDuration}
            setDefaultDuration={setDefaultDuration}
            bufferMinutes={bufferMinutes}
            setBufferMinutes={setBufferMinutes}
            minNotice={minNotice}
            setMinNotice={setMinNotice}
            maxAdvance={maxAdvance}
            setMaxAdvance={setMaxAdvance}
            schedule={schedule}
            setSchedule={setSchedule}
            closedDatesText={closedDatesText}
            setClosedDatesText={setClosedDatesText}
            calendarIntegration={calendarIntegration}
            connectingCalendar={connectingCalendar}
            handleConnectCalendar={handleConnectCalendar}
            handleSaveClinicSetup={handleSaveClinicSetup}
            saveLoading={saveLoading}
          />
        </TabsContent>

        <TabsContent value="info" className="space-y-6">
          <ClinicInfoTab
            loading={policiesLoading}
            staffDirectory={staffDirectory}
            setStaffDirectory={setStaffDirectory}
            clinicNotes={clinicNotes}
            setClinicNotes={setClinicNotes}
            onSave={handleSaveClinicInfo}
            saving={savingContext}
          />
        </TabsContent>

        <TabsContent value="voice" className="space-y-6">
          <VoiceTab
            voiceLoading={voiceLoading}
            voicesLoading={voicesLoading}
            selectedVoice={selectedVoice}
            greeting={greeting}
            setGreeting={setGreeting}
            voiceId={voiceId}
            setVoiceId={setVoiceId}
            availableVoices={availableVoices}
            tone={tone}
            setTone={setTone}
            language={language}
            setLanguage={setLanguage}
            afterHoursMessage={afterHoursMessage}
            setAfterHoursMessage={setAfterHoursMessage}
            handlePreviewVoice={handlePreviewVoice}
            previewGenerating={previewGenerating}
            handleSaveVoice={handleSaveVoice}
            voiceSaving={voiceSaving}
          />
        </TabsContent>

        <TabsContent value="services" className="space-y-6">
          <ServicesTab
            newServiceName={newServiceName}
            setNewServiceName={setNewServiceName}
            newServiceDuration={newServiceDuration}
            setNewServiceDuration={setNewServiceDuration}
            handleAddService={handleAddService}
            addingService={addingService}
            servicesLoading={servicesLoading}
            services={services}
            deleteService={deleteService}
          />
        </TabsContent>

        <TabsContent value="faqs" className="space-y-6">
          <FaqsTab
            newQuestion={newQuestion}
            setNewQuestion={setNewQuestion}
            newAnswer={newAnswer}
            setNewAnswer={setNewAnswer}
            handleAddFaq={handleAddFaq}
            addingFaq={addingFaq}
            faqsLoading={faqsLoading}
            faqs={faqs}
            deleteFaq={deleteFaq}
          />
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <PoliciesTab
            newPolicyType={newPolicyType}
            setNewPolicyType={setNewPolicyType}
            newPolicyContent={newPolicyContent}
            setNewPolicyContent={setNewPolicyContent}
            handleAddPolicy={handleAddPolicy}
            addingPolicy={addingPolicy}
            policiesLoading={policiesLoading}
            policies={policies}
            deletePolicy={deletePolicy}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
