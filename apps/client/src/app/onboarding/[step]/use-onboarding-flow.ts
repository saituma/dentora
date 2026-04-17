'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setOnboardingStatus } from '@/features/auth/authSlice';
import type { OnboardingStep } from '@/features/auth/types';
import {
  useSaveClinicProfileMutation,
  useSaveServicesMutation,
  useSaveBookingRulesMutation,
  useSavePoliciesMutation,
  useSaveVoiceProfileMutation,
  useSaveFaqsMutation,
  usePublishConfigMutation,
  useGetOnboardingStatusQuery,
  useSaveContextDocumentsMutation,
  useGetAvailableVoicesQuery,
  useSaveStaffMembersMutation,
} from '@/features/onboarding/onboardingApi';
import { useStartGoogleCalendarOAuthMutation } from '@/features/integrations/integrationsApi';
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import {
  useGetBookingRulesQuery,
  useGetFaqsQuery,
  useGetPoliciesQuery,
  useGetServicesQuery,
  useGetVoiceProfileQuery,
} from '@/features/aiConfig/aiConfigApi';
import {
  DEFAULT_BREAKABLE_SCHEDULE,
  parseClosedDatesText,
  toBreakableScheduleForm,
  toBreakableSchedulePayload,
  type BreakableScheduleRow as ScheduleRow,
  type WeekdayKey,
} from '@/features/aiConfig/schedule';
import { isAgentVoice, isSupportedContextFile, isUkVoice, readContextFileContent } from './onboarding-shared';
import type { KnowledgeFaqForm, KnowledgeServiceForm, KnowledgeStaffForm, UploadedContextFile } from './onboarding-types';
import { STEP_ORDER } from './onboarding-types';

export function useOnboardingFlow() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [saveClinicProfile, clinicProfileState] = useSaveClinicProfileMutation();
  const [saveServices, servicesState] = useSaveServicesMutation();
  const [saveBookingRules, bookingRulesState] = useSaveBookingRulesMutation();
  const [savePolicies, policiesState] = useSavePoliciesMutation();
  const [saveVoiceProfile, voiceState] = useSaveVoiceProfileMutation();
  const [saveFaqs, faqsState] = useSaveFaqsMutation();
  const [saveStaffMembers, staffState] = useSaveStaffMembersMutation();
  const [publishConfig, publishState] = usePublishConfigMutation();
  const [saveContextDocuments, contextDocumentsState] = useSaveContextDocumentsMutation();
  const { data: onboardingData, refetch: refetchOnboardingStatus } = useGetOnboardingStatusQuery();
  const { data: clinicData } = useGetClinicQuery();
  const { data: voiceProfileData } = useGetVoiceProfileQuery();
  const { data: bookingRulesData } = useGetBookingRulesQuery();
  const { data: policiesData } = useGetPoliciesQuery();
  const { data: servicesData } = useGetServicesQuery();
  const { data: faqsData } = useGetFaqsQuery();
  const { data: availableVoicesData } = useGetAvailableVoicesQuery();
  const [startGoogleCalendarOAuth, googleOAuthState] = useStartGoogleCalendarOAuthMutation();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [voiceTone] = useState<'professional' | 'warm' | 'friendly' | 'calm'>('professional');
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth' | 'pro'>('growth');
  const [greeting, setGreeting] = useState('Hi, welcome to our clinic, what can I help you with today?');
  const [selectedVoiceId, setSelectedVoiceId] = useState('professional');
  const [selectedAgentId, setSelectedAgentId] = useState('agent_5401kkemwc0sf23tw2km4ct4qpm9');
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(30);
  const [schedule, setSchedule] = useState<Record<WeekdayKey, ScheduleRow>>(DEFAULT_BREAKABLE_SCHEDULE);
  const [closedDatesText, setClosedDatesText] = useState('');
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState('');
  const [googleCalendarId, setGoogleCalendarId] = useState('primary');
  const [handledGoogleCallback, setHandledGoogleCallback] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [isDraggingContextFiles, setIsDraggingContextFiles] = useState(false);
  const [contextFiles, setContextFiles] = useState<UploadedContextFile[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [servicesForm, setServicesForm] = useState<KnowledgeServiceForm[]>([{
    serviceName: 'New Patient Exam',
    category: 'preventive',
    durationMinutes: 60,
    price: '120',
    description: 'Comprehensive exam and consultation for new patients.',
  }]);
  const [faqsForm, setFaqsForm] = useState<KnowledgeFaqForm[]>([{
    question: 'Do you accept my insurance?',
    answer: 'We accept most major PPO plans. Please call us with your insurance details so we can verify coverage.',
    category: 'insurance',
  }]);
  const [staffForm, setStaffForm] = useState<KnowledgeStaffForm[]>([{
    name: 'Dr. John Doe',
    role: 'Lead Dentist',
  }]);

  const requestedStep = params.step as string | undefined;
  const normalizedRequestedStep = requestedStep === 'rules' ? 'integrations' : requestedStep;
  const step = STEP_ORDER.includes(normalizedRequestedStep as OnboardingStep) ? (normalizedRequestedStep as OnboardingStep) : 'clinic-profile';
  const stepIndex = STEP_ORDER.indexOf(step);
  const currentStep = stepIndex >= 0 ? stepIndex : 0;
  const progressPercent = Math.round((currentStep / (STEP_ORDER.length - 1)) * 100);
  const allAvailableVoices = availableVoicesData?.data ?? [];
  const liveSupportedVoices = allAvailableVoices.filter((voice) => voice.liveSupported !== false);
  const agentVoices = liveSupportedVoices.filter(isAgentVoice);
  const ukVoices = liveSupportedVoices.filter(isUkVoice);
  const ukAgentVoices = agentVoices.filter(isUkVoice);
  const availableVoices = ukAgentVoices.length > 0 ? ukAgentVoices : agentVoices.length > 0 ? agentVoices : ukVoices.length > 0 ? ukVoices : liveSupportedVoices;
  const selectedVoice = availableVoices.find((voice) => voice.voiceId === selectedVoiceId)
    ?? liveSupportedVoices.find((voice) => voice.voiceId === selectedVoiceId)
    ?? null;
  const selectedVoiceRequiresPaidPlan = Boolean(selectedVoice?.requiresPaidPlan);
  const hasIntegrationWarning = onboardingData ? onboardingData.validationWarnings.some((warn) => warn.message === 'No integrations configured') : false;
  const calendarConnected = googleCalendarConnected || !hasIntegrationWarning;
  const hasMissingPoliciesError = onboardingData ? onboardingData.validationErrors.some((err) => err.message === 'No policies configured') : false;

  useEffect(() => {
    if (!clinicData) return;
    setClinicName(clinicData.clinicName ?? '');
    setAddress(clinicData.address ?? '');
    setPhone(clinicData.phone ?? '');
    setEmail(clinicData.email ?? '');
    setTimezone(clinicData.timezone ?? 'Europe/London');
    
    if (clinicData.staffMembers && clinicData.staffMembers.length > 0) {
      setStaffForm(clinicData.staffMembers);
    }
  }, [clinicData]);

  useEffect(() => {
    if (!voiceProfileData) return;
    if (voiceProfileData.voiceId) setSelectedVoiceId(voiceProfileData.voiceId);
    if (voiceProfileData.voiceAgentId) setSelectedAgentId(voiceProfileData.voiceAgentId);
    if (voiceProfileData.greetingMessage) setGreeting(voiceProfileData.greetingMessage);
    if (voiceProfileData.speechSpeed) setSpeakingSpeed(Number(voiceProfileData.speechSpeed));
  }, [voiceProfileData]);

  useEffect(() => {
    if (availableVoices.length > 0 && !availableVoices.some((voice) => voice.voiceId === selectedVoiceId)) {
      setSelectedVoiceId(availableVoices[0].voiceId);
    }
  }, [availableVoices, selectedVoiceId]);

  useEffect(() => {
    if (!bookingRulesData) return;
    setDefaultDuration(bookingRulesData.defaultAppointmentDurationMinutes ?? 30);
    setCancellationHours(bookingRulesData.minNoticePeriodHours ?? 24);
    setAdvanceBookingDays(bookingRulesData.maxAdvanceBookingDays ?? 30);
    setClosedDatesText((bookingRulesData.closedDates ?? []).join('\n'));
    setSchedule((current) => toBreakableScheduleForm(bookingRulesData.operatingSchedule, current));
  }, [bookingRulesData]);

  useEffect(() => {
    if (handledGoogleCallback) return;
    const googleCalendarStatus = searchParams.get('googleCalendar');
    if (googleCalendarStatus === 'connected') {
      setHandledGoogleCallback(true);
      setGoogleCalendarConnected(true);
      toast.success('Google Calendar connected');
      refetchOnboardingStatus();
      return;
    }
    if (googleCalendarStatus === 'failed') {
      setHandledGoogleCallback(true);
      const reason = searchParams.get('reason');
      toast.error(reason ? `Google Calendar connect failed: ${reason}` : 'Google Calendar connect failed');
    }
  }, [handledGoogleCallback, refetchOnboardingStatus, searchParams]);

  useEffect(() => {
    if (!policiesData?.data?.length) return;
    const documents = policiesData.data
      .flatMap((policy) => policy.sensitiveTopics ?? [])
      .filter((topic) => topic.type === 'context_document' && topic.content)
      .map((topic, index) => ({
        id: `${topic.title ?? 'document'}-${index}`,
        name: topic.title ?? `Context file ${index + 1}`,
        size: topic.content?.length ?? 0,
        mimeType: topic.mimeType ?? 'text/plain',
        content: topic.content ?? '',
      }));
    setContextFiles(documents);
  }, [policiesData]);

  const goNext = (nextStep: OnboardingStep) => {
    dispatch(setOnboardingStatus(nextStep));
    if (nextStep === 'complete') {
      dispatch(setOnboardingStatus('complete'));
      toast.success('Setup complete!');
      router.push('/dashboard');
      return;
    }
    router.push(`/onboarding/${nextStep}`);
  };

  const goBack = () => {
    if (currentStep <= 0) return;
    let previousIndex = currentStep - 1;
    while (previousIndex >= 0 && STEP_ORDER[previousIndex] === 'rules') {
      previousIndex -= 1;
    }
    if (previousIndex >= 0) {
      router.push(`/onboarding/${STEP_ORDER[previousIndex]}`);
    }
  };

  const addServiceRow = () => setServicesForm((prev) => [...prev, { serviceName: '', category: 'other', durationMinutes: 30, price: '', description: '' }]);
  const removeServiceRow = (index: number) => setServicesForm((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  const updateServiceRow = <K extends keyof KnowledgeServiceForm>(index: number, key: K, value: KnowledgeServiceForm[K]) => {
    setServicesForm((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const addFaqRow = () => setFaqsForm((prev) => [...prev, { question: '', answer: '', category: 'other' }]);
  const removeFaqRow = (index: number) => setFaqsForm((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  const updateFaqRow = <K extends keyof KnowledgeFaqForm>(index: number, key: K, value: KnowledgeFaqForm[K]) => {
    setFaqsForm((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const addStaffRow = () => setStaffForm((prev) => [...prev, { name: '', role: '' }]);
  const removeStaffRow = (index: number) => setStaffForm((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  const updateStaffRow = <K extends keyof KnowledgeStaffForm>(index: number, key: K, value: KnowledgeStaffForm[K]) => {
    setStaffForm((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const connectGoogleCalendar = async () => {
    const result = await startGoogleCalendarOAuth({
      accountEmail: googleCalendarEmail || undefined,
      calendarId: googleCalendarId || 'primary',
      returnTo: `${window.location.origin}/onboarding/schedule`,
    }).unwrap();
    window.location.assign(result.authUrl);
  };

  const addContextFiles = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;
    const nextFiles: UploadedContextFile[] = [];
    const maxSizeBytes = 5 * 1024 * 1024;
    for (const file of selectedFiles) {
      if (file.size > maxSizeBytes) {
        toast.error(`${file.name} is too large. Keep each file under 5MB.`);
        continue;
      }
      if (!isSupportedContextFile(file)) {
        toast.error(`${file.name} is not supported yet. Use TXT, MD, CSV, JSON, XML, HTML, PDF, DOCX, or XLSX files.`);
        continue;
      }
      const content = (await readContextFileContent(file)).trim();
      if (!content) {
        toast.error(`${file.name} is empty.`);
        continue;
      }
      nextFiles.push({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'text/plain',
        content: content.slice(0, 30000),
      });
    }
    if (nextFiles.length === 0) return;
    setContextFiles((prev) => {
      const byId = new Map(prev.map((file) => [file.id, file]));
      for (const file of nextFiles) byId.set(file.id, file);
      return Array.from(byId.values());
    });
    toast.success(`${nextFiles.length} file${nextFiles.length === 1 ? '' : 's'} added to AI context`);
  };

  const contextClinicName = clinicData?.clinicName || clinicName || 'Not provided yet';
  const contextTimezone = clinicData?.timezone || timezone || 'Not provided yet';
  const contextPhone = clinicData?.phone || phone || 'Not provided yet';
  const contextEmail = clinicData?.email || email || 'Not provided yet';
  const contextVoiceTone = voiceProfileData?.tone || voiceTone;
  const contextGreeting = voiceProfileData?.greetingMessage || greeting || 'Not provided yet';
  const contextDefaultDuration = bookingRulesData?.defaultAppointmentDurationMinutes ?? defaultDuration;
  const contextCancellationHours = bookingRulesData?.minNoticePeriodHours ?? cancellationHours;
  const contextAdvanceBookingDays = bookingRulesData?.maxAdvanceBookingDays ?? advanceBookingDays;
  const contextServicesCount = servicesData?.data?.length ?? servicesForm.filter((service) => service.serviceName.trim().length > 0).length;
  const contextFaqCount = faqsData?.data?.length ?? faqsForm.filter((faq) => faq.question.trim().length > 0 && faq.answer.trim().length > 0).length;
  const configuratorContext = [
    `Clinic name: ${contextClinicName}`,
    `Timezone: ${contextTimezone}`,
    `Primary phone: ${contextPhone}`,
    `Support email: ${contextEmail}`,
    `Voice tone: ${contextVoiceTone}`,
    `Greeting: ${contextGreeting}`,
    `Default appointment duration: ${contextDefaultDuration} minutes`,
    `Cancellation notice: ${contextCancellationHours} hours`,
    `Advance booking window: ${contextAdvanceBookingDays} days`,
    `Services configured: ${contextServicesCount}`,
    `FAQs configured: ${contextFaqCount}`,
    `Google Calendar connected: ${calendarConnected ? 'yes' : 'no'}`,
    `Readiness score: ${onboardingData?.readinessScore ?? 0}%`,
  ].join('\n');

  return {
    step,
    currentStep,
    progressPercent,
    fileInputRef,
    onboardingData,
    selectedPlan,
    setSelectedPlan,
    clinicName,
    setClinicName,
    address,
    setAddress,
    timezone,
    setTimezone,
    phone,
    setPhone,
    email,
    setEmail,
    greeting,
    setGreeting,
    selectedVoiceId,
    setSelectedVoiceId,
    selectedAgentId,
    setSelectedAgentId,
    speakingSpeed,
    setSpeakingSpeed,
    defaultDuration,
    setDefaultDuration,
    cancellationHours,
    setCancellationHours,
    advanceBookingDays,
    setAdvanceBookingDays,
    schedule,
    setSchedule,
    closedDatesText,
    setClosedDatesText,
    googleCalendarEmail,
    setGoogleCalendarEmail,
    googleCalendarId,
    setGoogleCalendarId,
    googleCalendarConnected,
    isDraggingContextFiles,
    setIsDraggingContextFiles,
    contextFiles,
    setContextFiles,
    servicesForm,
    faqsForm,
    staffForm,
    availableVoices,
    ukAgentVoices,
    agentVoices,
    ukVoices,
    liveSupportedVoices,
    selectedVoice,
    selectedVoiceRequiresPaidPlan,
    calendarConnected,
    hasIntegrationWarning,
    hasMissingPoliciesError,
    configuratorContext,
    addServiceRow,
    removeServiceRow,
    updateServiceRow,
    addFaqRow,
    removeFaqRow,
    updateFaqRow,
    addStaffRow,
    removeStaffRow,
    updateStaffRow,
    goNext,
    goBack,
    connectGoogleCalendar,
    addContextFiles,
    parseClosedDatesText,
    toBreakableSchedulePayload,
    refetchOnboardingStatus,
    saveClinicProfile,
    saveServices,
    saveBookingRules,
    savePolicies,
    saveVoiceProfile,
    saveFaqs,
    saveStaffMembers,
    publishConfig,
    saveContextDocuments,
    savingClinicProfile: clinicProfileState.isLoading,
    savingServices: servicesState.isLoading,
    savingRules: bookingRulesState.isLoading,
    savingPolicies: policiesState.isLoading,
    savingVoice: voiceState.isLoading,
    savingFaqs: faqsState.isLoading,
    savingStaff: staffState.isLoading,
    publishingConfig: publishState.isLoading,
    savingContextDocuments: contextDocumentsState.isLoading,
    startingGoogleOAuth: googleOAuthState.isLoading,
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
