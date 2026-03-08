'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUpIcon, BotIcon, PauseIcon, PlayIcon, UserIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setOnboardingStatus } from '@/features/auth/authSlice';
import type { OnboardingStep } from '@/features/auth/types';
import { Stepper } from '@/components/stepper';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import {
  useSaveClinicProfileMutation,
  useSaveServicesMutation,
  useSaveBookingRulesMutation,
  useSavePoliciesMutation,
  useSaveVoiceProfileMutation,
  useSaveFaqsMutation,
  usePublishConfigMutation,
  useGetOnboardingStatusQuery,
  useSendConfigChatMessageMutation,
  useGetAvailableVoicesQuery,
} from '@/features/onboarding/onboardingApi';
import type { AvailableVoiceOption } from '@/features/onboarding/onboardingApi';
import {
  useStartGoogleCalendarOAuthMutation,
} from '@/features/integrations/integrationsApi';
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import {
  useGetBookingRulesQuery,
  useGetFaqsQuery,
  useGetServicesQuery,
  useGetVoiceProfileQuery,
} from '@/features/aiConfig/aiConfigApi';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const STEPS = [
  { id: 'clinic-profile', label: 'Profile' },
  { id: 'knowledge-base', label: 'Knowledge' },
  { id: 'voice', label: 'Voice' },
  { id: 'rules', label: 'Rules' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'ai-chat', label: 'AI Chat' },
  { id: 'test-call', label: 'Test' },
  { id: 'complete', label: 'Done' },
];

const STEP_ORDER = STEPS.map((s) => s.id) as OnboardingStep[];

type ServiceCategory = 'preventive' | 'restorative' | 'cosmetic' | 'emergency' | 'orthodontic' | 'other';
type FaqCategory = 'insurance' | 'hours' | 'procedures' | 'billing' | 'preparation' | 'other';

interface KnowledgeServiceForm {
  serviceName: string;
  category: ServiceCategory;
  durationMinutes: number;
  price: string;
  description: string;
}

interface KnowledgeFaqForm {
  question: string;
  answer: string;
  category: FaqCategory;
}

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
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
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

const DEFAULT_SCHEDULE: Record<WeekdayKey, ScheduleRow> = {
  monday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  tuesday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  wednesday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  thursday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  friday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  saturday: { enabled: false, start: '09:00', end: '13:00', hasBreak: false, breakStart: '12:00', breakEnd: '12:30' },
  sunday: { enabled: false, start: '09:00', end: '13:00', hasBreak: false, breakStart: '12:00', breakEnd: '12:30' },
};

const STEP_META: Record<
  OnboardingStep,
  { title: string; description: string }
> = {
  'clinic-profile': {
    title: 'Tell us about your clinic',
    description:
      'Set your core profile details so your AI sounds like your front desk.',
  },
  'knowledge-base': {
    title: 'Tell us your clinic knowledge',
    description:
      'Fill in services, pricing, and FAQs so responses stay accurate and consistent.',
  },
  voice: {
    title: 'Choose voice and personality',
    description:
      'Pick an ElevenLabs voice and greeting style that matches your brand and patient experience.',
  },
  rules: {
    title: 'Define booking rules',
    description:
      'Configure appointment length and policies your AI should always follow.',
  },
  integrations: {
    title: 'Connect key tools',
    description:
      'Integrate calendar tools now or skip and connect later from settings.',
  },
  schedule: {
    title: 'Set clinic hours and breaks',
    description:
      'Define real working days, opening hours, and break windows so booking always respects your clinic schedule.',
  },
  'ai-chat': {
    title: 'Train your AI receptionist',
    description:
      'Chat with AI to provide extra context about your clinic tone, workflows, and edge cases.',
  },
  'test-call': {
    title: 'Run a quick test call',
    description:
      'Make sure everything works before going live with patient traffic.',
  },
  complete: {
    title: 'Complete setup',
    description: 'Final step before entering your dashboard.',
  },
};

function AudioPreviewPlayer({
  src,
  idleLabel,
  playingLabel,
}: {
  src: string;
  idleLabel: string;
  playingLabel: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-9 shrink-0"
        onClick={() => {
          if (!audioRef.current) return;
          if (playing) {
            audioRef.current.pause();
            setPlaying(false);
          } else {
            audioRef.current
              .play()
              .then(() => setPlaying(true))
              .catch(() => {
                setPlaying(false);
                toast.error('Could not play greeting preview. Check browser/tab sound and try again.');
              });
          }
        }}
      >
        {playing ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </Button>
      <span className="text-sm text-muted-foreground">
        {playing ? playingLabel : idleLabel}
      </span>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}

function isUkVoice(voice: AvailableVoiceOption): boolean {
  const searchable = [voice.locale, voice.accent, voice.label, voice.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    searchable.includes('en-gb') ||
    searchable.includes('british') ||
    searchable.includes('uk') ||
    searchable.includes('united kingdom') ||
    searchable.includes('english') ||
    searchable.includes('england') ||
    searchable.includes('scottish') ||
    searchable.includes('welsh')
  );
}

function toScheduleForm(
  bookingSchedule?: Record<string, unknown>,
  current?: Record<WeekdayKey, ScheduleRow>,
): Record<WeekdayKey, ScheduleRow> {
  const source = bookingSchedule ?? {};
  const base = current ?? DEFAULT_SCHEDULE;

  if (Object.keys(source).length === 0) {
    return { ...base };
  }

  const next = { ...base };
  for (const day of WEEKDAYS) {
    const rawValue = source[day.key];
    if (!rawValue || typeof rawValue !== 'object') {
      next[day.key] = { ...base[day.key], enabled: false, hasBreak: false };
      continue;
    }

    const entry = rawValue as {
      start?: unknown;
      end?: unknown;
      breakStart?: unknown;
      breakEnd?: unknown;
      breaks?: Array<{ start?: unknown; end?: unknown }> | unknown;
    };
    const breakEntry = Array.isArray(entry.breaks) && entry.breaks.length > 0 ? entry.breaks[0] : null;
    const breakStart =
      typeof breakEntry?.start === 'string'
        ? breakEntry.start
        : typeof entry.breakStart === 'string'
          ? entry.breakStart
          : '';
    const breakEnd =
      typeof breakEntry?.end === 'string'
        ? breakEntry.end
        : typeof entry.breakEnd === 'string'
          ? entry.breakEnd
          : '';

    if (typeof entry.start === 'string' && typeof entry.end === 'string') {
      next[day.key] = {
        enabled: true,
        start: entry.start,
        end: entry.end,
        hasBreak: Boolean(breakStart && breakEnd),
        breakStart: breakStart || base[day.key].breakStart,
        breakEnd: breakEnd || base[day.key].breakEnd,
      };
    }
  }

  return next;
}

function toSchedulePayload(
  schedule: Record<WeekdayKey, ScheduleRow>,
): Record<string, { start: string; end: string; breaks?: Array<{ start: string; end: string }> } | null> {
  return WEEKDAYS.reduce<Record<string, { start: string; end: string; breaks?: Array<{ start: string; end: string }> } | null>>(
    (acc, day) => {
      const value = schedule[day.key];
      if (!value.enabled) {
        acc[day.key] = null;
        return acc;
      }

      acc[day.key] = {
        start: value.start,
        end: value.end,
        ...(value.hasBreak && value.breakStart && value.breakEnd
          ? { breaks: [{ start: value.breakStart, end: value.breakEnd }] }
          : {}),
      };
      return acc;
    },
    {},
  );
}

function parseClosedDatesText(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function OnboardingStepPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [saveClinicProfile, { isLoading: savingProfile }] = useSaveClinicProfileMutation();
  const [saveServices, { isLoading: savingServices }] = useSaveServicesMutation();
  const [saveBookingRules, { isLoading: savingRules }] = useSaveBookingRulesMutation();
  const [savePolicies, { isLoading: savingPolicies }] = useSavePoliciesMutation();
  const [saveVoiceProfile, { isLoading: savingVoice }] = useSaveVoiceProfileMutation();
  const [saveFaqs, { isLoading: savingFaqs }] = useSaveFaqsMutation();
  const [publishConfig, { isLoading: publishing }] = usePublishConfigMutation();
  const { data: onboardingData, refetch: refetchOnboardingStatus } = useGetOnboardingStatusQuery();
  const { data: clinicData } = useGetClinicQuery();
  const { data: voiceProfileData } = useGetVoiceProfileQuery();
  const { data: bookingRulesData } = useGetBookingRulesQuery();
  const { data: servicesData } = useGetServicesQuery();
  const { data: faqsData } = useGetFaqsQuery();
  const { data: availableVoicesData } = useGetAvailableVoicesQuery();
  const [sendConfigChatMessage, { isLoading: testingAi }] = useSendConfigChatMessageMutation();
  const [startGoogleCalendarOAuth, { isLoading: startingGoogleOAuth }] = useStartGoogleCalendarOAuthMutation();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [voiceTone, setVoiceTone] = useState<'professional' | 'warm' | 'friendly' | 'calm'>('professional');
  const [greeting, setGreeting] = useState('Hi, thank you for calling. How can I help you today?');
  const [selectedVoiceId, setSelectedVoiceId] = useState('professional');
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(30);
  const [schedule, setSchedule] = useState<Record<WeekdayKey, ScheduleRow>>(DEFAULT_SCHEDULE);
  const [closedDatesText, setClosedDatesText] = useState('');
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState('');
  const [googleCalendarId, setGoogleCalendarId] = useState('primary');
  const [handledGoogleCallback, setHandledGoogleCallback] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [configChatInput, setConfigChatInput] = useState('');
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const [configChatMessages, setConfigChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>
  >([]);
  const [servicesForm, setServicesForm] = useState<KnowledgeServiceForm[]>([
    {
      serviceName: 'New Patient Exam',
      category: 'preventive',
      durationMinutes: 60,
      price: '120',
      description: 'Comprehensive exam and consultation for new patients.',
    },
  ]);
  const [faqsForm, setFaqsForm] = useState<KnowledgeFaqForm[]>([
    {
      question: 'Do you accept my insurance?',
      answer: 'We accept most major PPO plans. Please call us with your insurance details so we can verify coverage.',
      category: 'insurance',
    },
  ]);
  const allAvailableVoices = availableVoicesData?.data ?? [];
  const ukVoices = allAvailableVoices.filter(isUkVoice);
  const availableVoices = ukVoices.length > 0 ? ukVoices : allAvailableVoices;
  const selectedVoice =
    availableVoices.find((voice) => voice.voiceId === selectedVoiceId) ??
    allAvailableVoices.find((voice) => voice.voiceId === selectedVoiceId) ??
    null;

  useEffect(() => {
    if (!clinicData) return;

    setClinicName(clinicData.clinicName ?? '');
    setAddress(clinicData.address ?? '');
    setPhone(clinicData.phone ?? '');
    setEmail(clinicData.email ?? '');
    setTimezone(clinicData.timezone ?? 'America/New_York');
  }, [clinicData]);

  useEffect(() => {
    if (!voiceProfileData) return;

    if (voiceProfileData.voiceId) {
      setSelectedVoiceId(voiceProfileData.voiceId);
    }

    if (voiceProfileData.greetingMessage) {
      setGreeting(voiceProfileData.greetingMessage);
    }

    if (voiceProfileData.speechSpeed) {
      setSpeakingSpeed(Number(voiceProfileData.speechSpeed));
    }
  }, [voiceProfileData]);

  useEffect(() => {
    if (availableVoices.length === 0) return;
    const hasSelectedVoice = availableVoices.some((voice) => voice.voiceId === selectedVoiceId);
    if (!hasSelectedVoice) {
      setSelectedVoiceId(availableVoices[0].voiceId);
    }
  }, [availableVoices, selectedVoiceId]);

  useEffect(() => {
    if (!bookingRulesData) return;

    setDefaultDuration(bookingRulesData.defaultAppointmentDurationMinutes ?? 30);
    setCancellationHours(bookingRulesData.minNoticePeriodHours ?? 24);
    setAdvanceBookingDays(bookingRulesData.maxAdvanceBookingDays ?? 30);
    setClosedDatesText((bookingRulesData.closedDates ?? []).join('\n'));
    setSchedule((current) => toScheduleForm(bookingRulesData.operatingSchedule, current));
  }, [bookingRulesData]);

  const addServiceRow = () => {
    setServicesForm((prev) => [
      ...prev,
      {
        serviceName: '',
        category: 'other',
        durationMinutes: 30,
        price: '',
        description: '',
      },
    ]);
  };

  const removeServiceRow = (index: number) => {
    setServicesForm((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const updateServiceRow = <K extends keyof KnowledgeServiceForm>(
    index: number,
    key: K,
    value: KnowledgeServiceForm[K],
  ) => {
    setServicesForm((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const addFaqRow = () => {
    setFaqsForm((prev) => [
      ...prev,
      {
        question: '',
        answer: '',
        category: 'other',
      },
    ]);
  };

  const removeFaqRow = (index: number) => {
    setFaqsForm((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const updateFaqRow = <K extends keyof KnowledgeFaqForm>(
    index: number,
    key: K,
    value: KnowledgeFaqForm[K],
  ) => {
    setFaqsForm((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const requestedStep = params.step as string | undefined;
  const step = STEP_ORDER.includes(requestedStep as OnboardingStep)
    ? (requestedStep as OnboardingStep)
    : 'clinic-profile';
  const stepIndex = STEP_ORDER.indexOf(step);
  const currentStep = stepIndex >= 0 ? stepIndex : 0;
  const progressPercent = Math.round(
    (currentStep / (STEP_ORDER.length - 1)) * 100
  );

  const goNext = (nextStep: OnboardingStep) => {
    dispatch(setOnboardingStatus(nextStep));
    if (nextStep === 'complete') {
      dispatch(setOnboardingStatus('complete'));
      toast.success('Setup complete!');
      router.push('/dashboard');
    } else {
      router.push(`/onboarding/${nextStep}`);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      const prevStep = STEP_ORDER[currentStep - 1];
      router.push(`/onboarding/${prevStep}`);
    }
  };

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

  const connectGoogleCalendar = async () => {
    const result = await startGoogleCalendarOAuth({
      accountEmail: googleCalendarEmail || undefined,
      calendarId: googleCalendarId || 'primary',
      returnTo: `${window.location.origin}/onboarding/schedule`,
    }).unwrap();

    window.location.assign(result.authUrl);
  };

  const hasIntegrationWarning = onboardingData
    ? onboardingData.validationWarnings.some((warn) => warn.message === 'No integrations configured')
    : false;
  const calendarConnected = googleCalendarConnected || !hasIntegrationWarning;
  const hasMissingPoliciesError = onboardingData
    ? onboardingData.validationErrors.some((err) => err.message === 'No policies configured')
    : false;

  const contextClinicName = clinicData?.clinicName || clinicName || 'Not provided yet';
  const contextTimezone = clinicData?.timezone || timezone || 'Not provided yet';
  const contextPhone = clinicData?.phone || phone || 'Not provided yet';
  const contextEmail = clinicData?.email || email || 'Not provided yet';
  const contextVoiceTone = voiceProfileData?.tone || voiceTone;
  const contextGreeting = voiceProfileData?.greetingMessage || greeting || 'Not provided yet';
  const contextDefaultDuration =
    bookingRulesData?.defaultAppointmentDurationMinutes ?? defaultDuration;
  const contextCancellationHours =
    bookingRulesData?.minNoticePeriodHours ?? cancellationHours;
  const contextAdvanceBookingDays =
    bookingRulesData?.maxAdvanceBookingDays ?? advanceBookingDays;
  const contextServicesCount =
    servicesData?.data?.length ?? servicesForm.filter((service) => service.serviceName.trim().length > 0).length;
  const contextFaqCount =
    faqsData?.data?.length ?? faqsForm.filter((faq) => faq.question.trim().length > 0 && faq.answer.trim().length > 0).length;

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

  const userTurns = configChatMessages.filter((turn) => turn.role === 'user');
  const assistantTurns = configChatMessages.filter((turn) => turn.role === 'assistant');
  const lastUserMessage =
    userTurns.length > 0 ? userTurns[userTurns.length - 1].content : 'None yet.';
  const lastAssistantQuestion = [...assistantTurns]
    .reverse()
    .find((turn) => turn.content.includes('?'))?.content;

  const aiContextSummary = [
    `User messages captured: ${userTurns.length}`,
    `AI responses generated: ${assistantTurns.length}`,
    `Latest user input: ${lastUserMessage.slice(0, 180)}`,
    `Current AI focus: ${(lastAssistantQuestion || 'No open question right now.').slice(0, 220)}`,
  ].join('\n');

  const aiClinicContextMarkdown = [
    '### 🏥 Clinic Configuration Context',
    '',
    '```text',
    configuratorContext,
    '```',
    '',
    '### 🤖 AI Context Summary',
    '',
    aiContextSummary
      .split('\n')
      .map((line) => `- ${line}`)
      .join('\n'),
  ].join('\n');

  useEffect(() => {
    if (step !== 'ai-chat' || configChatMessages.length > 0) return;

    const firstQuestion =
      contextClinicName === 'Not provided yet'
        ? 'To start, what is your exact clinic name and primary phone number?'
        : contextServicesCount === 0
          ? 'What are the top 3 services you want your receptionist to handle first, with duration and price?'
          : contextFaqCount === 0
            ? 'What are the most common patient questions you want your receptionist to answer?'
            : 'What specific workflows or edge cases should your receptionist handle exactly your way?';

    setConfigChatMessages([
      {
        role: 'assistant',
        content:
          `Hi! I’m your configuration assistant. I’ll ask focused questions so your DentalFlow receptionist has clear, reliable context for your clinic.\n\n${firstQuestion}`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [
    step,
    configChatMessages.length,
    contextClinicName,
    contextFaqCount,
    contextServicesCount,
  ]);

  useEffect(() => {
    if (step !== 'ai-chat' || !chatScrollRef.current) return;

    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [step, configChatMessages, testingAi]);

  if (step === 'complete') {
    goNext('complete');
    return null;
  }

  const sendConfigMessage = async () => {
    const userMessage = configChatInput.trim();
    if (!userMessage) {
      toast.error('Enter configuration instructions first');
      return;
    }

    const userTurn = {
      role: 'user' as const,
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    setConfigChatMessages((prev) => [...prev, userTurn]);
    setConfigChatInput('');

    try {
      const result = await sendConfigChatMessage({
        message: userMessage,
        conversationHistory: [
          {
            role: 'system',
            content: `[CONFIG_CONTEXT]\n${configuratorContext}`,
            timestamp: new Date().toISOString(),
          },
          ...configChatMessages,
        ],
      }).unwrap();

      setConfigChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
        },
      ]);

      toast.success('Configuration response generated');
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs  font-semibold tracking-wide text-primary uppercase">
              Step {currentStep + 1} of {STEP_ORDER.length}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {STEP_META[step].title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {STEP_META[step].description}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {progressPercent}%
          </div>
        </div>
        <Stepper steps={STEPS} currentStep={currentStep} />
      </div>

      {step === 'clinic-profile' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Clinic profile</CardTitle>
            <CardDescription>
              Enter your clinic details and business hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await saveClinicProfile({
                    clinicName,
                    address: address || undefined,
                    phone: phone || undefined,
                    email: email || undefined,
                    timezone,
                  }).unwrap();
                  toast.success('Clinic profile saved');
                  goNext('knowledge-base');
                } catch (err: unknown) {
                  toast.error(getUserFriendlyApiError(err));
                }
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>Clinic name</FieldLabel>
                  <Input
                    placeholder="Smile Dental"
                    required
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Address</FieldLabel>
                  <Input
                    placeholder="123 Main St"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input
                    placeholder="+1 555-0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    placeholder="office@smiledental.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Timezone</FieldLabel>
                  <Select value={timezone} onValueChange={(value) => value && setTimezone(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern</SelectItem>
                      <SelectItem value="America/Chicago">Central</SelectItem>
                      <SelectItem value="America/Denver">Mountain</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goBack}
                    className="min-w-28"
                  >
                    Back
                  </Button>
                  <Button type="submit" className="min-w-28" disabled={savingProfile}>
                    {savingProfile ? 'Saving...' : 'Next'}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'knowledge-base' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Knowledge base</CardTitle>
            <CardDescription>
              Fill in services, pricing, and FAQs
            </CardDescription>
            <p className="text-sm text-muted-foreground">
              Add at least one service and one FAQ to continue.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const validServices = servicesForm
                    .filter((service) => service.serviceName.trim().length > 0)
                    .map((service) => ({
                      serviceName: service.serviceName.trim(),
                      category: service.category,
                      description: service.description.trim() || undefined,
                      durationMinutes: service.durationMinutes,
                      price: service.price.trim() || undefined,
                      isActive: true,
                    }));

                  const validFaqs = faqsForm
                    .filter((faq) => faq.question.trim().length > 0 && faq.answer.trim().length > 0)
                    .map((faq) => ({
                      question: faq.question.trim(),
                      answer: faq.answer.trim(),
                      category: faq.category,
                    }));

                  if (validServices.length === 0 || validFaqs.length === 0) {
                    toast.error('Add at least one service and one FAQ');
                    return;
                  }

                  await saveServices({
                    services: validServices,
                  }).unwrap();

                  await saveFaqs({
                    faqs: validFaqs,
                  }).unwrap();

                  toast.success('Knowledge base saved');
                  goNext('voice');
                } catch (err: unknown) {
                  toast.error(getUserFriendlyApiError(err));
                }
              }}
            >
              <FieldGroup>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Services</p>
                    <Button type="button" variant="outline" onClick={addServiceRow}>Add service</Button>
                  </div>
                  {servicesForm.map((service, index) => (
                    <div key={`service-${index}`} className="space-y-3 rounded-lg border p-4">
                      <Field>
                        <FieldLabel>Service name</FieldLabel>
                        <Input
                          placeholder="New Patient Exam"
                          required
                          value={service.serviceName}
                          onChange={(e) => updateServiceRow(index, 'serviceName', e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Service category</FieldLabel>
                        <Select
                          value={service.category}
                          onValueChange={(value) => value && updateServiceRow(index, 'category', value as ServiceCategory)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="preventive">Preventive</SelectItem>
                            <SelectItem value="restorative">Restorative</SelectItem>
                            <SelectItem value="cosmetic">Cosmetic</SelectItem>
                            <SelectItem value="emergency">Emergency</SelectItem>
                            <SelectItem value="orthodontic">Orthodontic</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>Duration (minutes)</FieldLabel>
                        <Input
                          type="number"
                          min={5}
                          max={240}
                          required
                          value={service.durationMinutes}
                          onChange={(e) => updateServiceRow(index, 'durationMinutes', Number(e.target.value))}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Price (USD)</FieldLabel>
                        <Input
                          placeholder="120"
                          value={service.price}
                          onChange={(e) => updateServiceRow(index, 'price', e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Service details</FieldLabel>
                        <Textarea
                          rows={2}
                          placeholder="What is included, prep instructions, or follow-up details"
                          value={service.description}
                          onChange={(e) => updateServiceRow(index, 'description', e.target.value)}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeServiceRow(index)}
                        disabled={servicesForm.length === 1}
                      >
                        Remove service
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">FAQs</p>
                    <Button type="button" variant="outline" onClick={addFaqRow}>Add FAQ</Button>
                  </div>
                  {faqsForm.map((faq, index) => (
                    <div key={`faq-${index}`} className="space-y-3 rounded-lg border p-4">
                      <Field>
                        <FieldLabel>FAQ question</FieldLabel>
                        <Input
                          placeholder="Do you accept insurance?"
                          required
                          value={faq.question}
                          onChange={(e) => updateFaqRow(index, 'question', e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>FAQ answer</FieldLabel>
                        <Textarea
                          rows={3}
                          placeholder="We accept major PPO plans..."
                          required
                          value={faq.answer}
                          onChange={(e) => updateFaqRow(index, 'answer', e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>FAQ category</FieldLabel>
                        <Select
                          value={faq.category}
                          onValueChange={(value) => value && updateFaqRow(index, 'category', value as FaqCategory)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="insurance">Insurance</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="procedures">Procedures</SelectItem>
                            <SelectItem value="billing">Billing</SelectItem>
                            <SelectItem value="preparation">Preparation</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeFaqRow(index)}
                        disabled={faqsForm.length === 1}
                      >
                        Remove FAQ
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={goBack} className="min-w-28">
                    Back
                  </Button>
                  <Button type="submit" className="min-w-28" disabled={savingServices || savingFaqs}>
                    {savingServices || savingFaqs ? 'Saving...' : 'Next'}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'voice' && (
        <div className="space-y-6">
          {/* Voice selection */}
          <Card className="border-0 bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Choose a voice</CardTitle>
              <CardDescription>
                Choose from the ElevenLabs voices available to your configured API key.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableVoices.length === 0 ? (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700">
                  No ElevenLabs voices were returned. Add `ELEVENLABS_API_KEY` to the server env and verify the key has access to your voices.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                    {ukVoices.length > 0
                      ? 'Showing UK-accent voices only. Voice samples use ElevenLabs preview clips so they still work without paid TTS preview credits.'
                      : 'No UK-accent voices were returned by ElevenLabs, so all available voices are shown instead.'}
                  </div>
                  <Field>
                    <FieldLabel>Available voices</FieldLabel>
                    <Select
                      value={selectedVoiceId}
                      onValueChange={(value) => {
                        setSelectedVoiceId(value || 'professional');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVoices.map((voice) => (
                          <SelectItem key={voice.voiceId} value={voice.voiceId}>
                            {voice.name}{voice.label ? ` - ${voice.label}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {availableVoices.map((voice) => (
                      <div
                        key={voice.voiceId}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedVoiceId(voice.voiceId);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedVoiceId(voice.voiceId);
                          }
                        }}
                        className={`rounded-xl border p-4 transition ${
                          selectedVoiceId === voice.voiceId
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border bg-card hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{voice.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{voice.label || 'ElevenLabs voice'}</p>
                          </div>
                          {selectedVoiceId === voice.voiceId && (
                            <Badge variant="default">Selected</Badge>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {voice.gender && <Badge variant="outline">{voice.gender}</Badge>}
                          {voice.accent && <Badge variant="outline">{voice.accent}</Badge>}
                          {voice.locale && <Badge variant="outline">{voice.locale}</Badge>}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!voice.previewUrl}
                            onClick={async (event) => {
                              event.stopPropagation();
                              try {
                                if (!voice.previewUrl) return;
                                const audio = new Audio(voice.previewUrl);
                                await audio.play();
                              } catch {
                                toast.error('Could not play the ElevenLabs sample clip. Try again.');
                              }
                            }}
                          >
                            {voice.previewUrl ? 'Play sample' : 'No sample clip'}
                          </Button>
                          {voice.previewUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                window.open(voice.previewUrl, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              ElevenLabs sample
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Speaking speed */}
          <Card className="border-0 bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Speaking speed</CardTitle>
              <CardDescription>
                Adjust how fast the AI receptionist speaks. A moderate pace works best for most callers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Slower</span>
                  <span className="rounded-md bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    {speakingSpeed.toFixed(1)}x
                  </span>
                  <span className="text-sm text-muted-foreground">Faster</span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={speakingSpeed}
                  onChange={(e) => {
                    setSpeakingSpeed(parseFloat(e.target.value));
                  }}
                  className="w-full cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>0.8x</span>
                  <span>1.0x (default)</span>
                  <span>1.2x</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Greeting message */}
          <Card className="border-0 bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Greeting message</CardTitle>
              <CardDescription>
                This is the first thing callers hear. Include your clinic name and offer to help.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>Greeting</FieldLabel>
                  <Textarea
                    value={greeting}
                    onChange={(e) => {
                      setGreeting(e.target.value);
                    }}
                    rows={3}
                    placeholder="Hi, thank you for calling Bright Smile Dental. How can I assist you today?"
                  />
                </Field>
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700">
                  Custom greeting preview needs a paid ElevenLabs text-to-speech request. You can still use the selected voice sample below for free.
                </div>
                {selectedVoice?.previewUrl ? (
                  <AudioPreviewPlayer
                    src={selectedVoice.previewUrl}
                    idleLabel="Play selected voice sample"
                    playingLabel="Playing selected voice sample..."
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    The selected voice does not include a free ElevenLabs sample clip.
                  </div>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={goBack} className="min-w-28">
              Back
            </Button>
            <Button
              disabled={savingVoice}
              onClick={async () => {
                try {
                  await saveVoiceProfile({
                    voiceId: selectedVoiceId,
                    tone: voiceTone,
                    greeting,
                    speed: speakingSpeed,
                    language: selectedVoice?.locale ?? 'en-US',
                  }).unwrap();
                  toast.success('Voice profile saved');
                  goNext('rules');
                } catch (err: unknown) {
                  toast.error(getUserFriendlyApiError(err));
                }
              }}
              className="min-w-28"
            >
              {savingVoice ? 'Saving...' : 'Next'}
            </Button>
          </div>
        </div>
      )}

      {step === 'rules' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Appointment rules</CardTitle>
            <CardDescription>Set booking policies your AI should always follow</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Default duration (min)</FieldLabel>
                <Input
                  type="number"
                  value={defaultDuration}
                  onChange={(e) => setDefaultDuration(Number(e.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel>Advance booking (days)</FieldLabel>
                <Input
                  type="number"
                  value={advanceBookingDays}
                  onChange={(e) => setAdvanceBookingDays(Number(e.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel>Cancellation notice (hours)</FieldLabel>
                <Input
                  type="number"
                  value={cancellationHours}
                  onChange={(e) => setCancellationHours(Number(e.target.value))}
                />
              </Field>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button
                  disabled={savingRules}
                  onClick={async () => {
                    try {
                      await saveBookingRules({
                        advanceBookingDays,
                        cancellationHours,
                        defaultAppointmentDurationMinutes: defaultDuration,
                      }).unwrap();

                      await savePolicies({
                        policies: [
                          {
                            policyType: 'escalation',
                            content:
                              'Escalate to a human team member when the caller asks for clinical advice, has unresolved billing disputes, or requests manager intervention.',
                          },
                          {
                            policyType: 'emergency',
                            content:
                              'If the caller reports severe pain, bleeding, trauma, or breathing issues, instruct them to call 911 immediately and notify the on-call staff.',
                          },
                        ],
                      }).unwrap();

                      toast.success('Booking rules saved');
                      goNext('integrations');
                    } catch (err: unknown) {
                      toast.error(getUserFriendlyApiError(err));
                    }
                  }}
                  className="min-w-28"
                >
                  {savingRules ? 'Saving...' : 'Next'}
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      )}

      {step === 'integrations' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Integrations</CardTitle>
            <CardDescription>
              Connect your calendar, then define the exact hours and breaks your AI can book into.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Google account email (optional)</FieldLabel>
                <Input
                  type="email"
                  placeholder="frontdesk@clinic.com"
                  value={googleCalendarEmail}
                  onChange={(e) => setGoogleCalendarEmail(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Calendar ID</FieldLabel>
                <Input
                  placeholder="primary"
                  value={googleCalendarId}
                  onChange={(e) => setGoogleCalendarId(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                {calendarConnected && (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                    Google Calendar is connected. Continue to clinic hours.
                  </div>
                )}
                <Button
                  onClick={() => goNext('schedule')}
                  variant="outline"
                  className="min-w-32"
                  type="button"
                >
                  {calendarConnected ? 'Continue' : 'Skip for now'}
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await connectGoogleCalendar();
                    } catch (err: unknown) {
                      toast.error(getUserFriendlyApiError(err));
                    }
                  }}
                  className="min-w-44"
                  disabled={startingGoogleOAuth}
                >
                  {startingGoogleOAuth ? 'Redirecting...' : 'Connect Google Calendar'}
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      )}

      {step === 'schedule' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Clinic schedule</CardTitle>
            <CardDescription>
              Set the actual days, opening hours, and break times your AI receptionist must respect when offering appointments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold">Weekly working hours</h3>
                  <p className="text-sm text-muted-foreground">
                    Turn days on or off, then set opening and closing times. Add one break window per day for lunch or staff-only time.
                  </p>
                </div>
                <div className="space-y-3">
                  {WEEKDAYS.map((day) => {
                    const row = schedule[day.key];
                    return (
                      <div key={day.key} className="rounded-lg border bg-background p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <label className="flex items-center gap-3 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSchedule((prev) => ({
                                  ...prev,
                                  [day.key]: {
                                    ...prev[day.key],
                                    enabled: checked,
                                    hasBreak: checked ? prev[day.key].hasBreak : false,
                                  },
                                }));
                              }}
                            />
                            {day.label}
                          </label>
                          <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Field>
                              <FieldLabel>Open</FieldLabel>
                              <Input
                                type="time"
                                value={row.start}
                                disabled={!row.enabled}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSchedule((prev) => ({
                                    ...prev,
                                    [day.key]: { ...prev[day.key], start: value },
                                  }));
                                }}
                              />
                            </Field>
                            <Field>
                              <FieldLabel>Close</FieldLabel>
                              <Input
                                type="time"
                                value={row.end}
                                disabled={!row.enabled}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSchedule((prev) => ({
                                    ...prev,
                                    [day.key]: { ...prev[day.key], end: value },
                                  }));
                                }}
                              />
                            </Field>
                            <Field>
                              <FieldLabel>Break start</FieldLabel>
                              <Input
                                type="time"
                                value={row.breakStart}
                                disabled={!row.enabled || !row.hasBreak}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSchedule((prev) => ({
                                    ...prev,
                                    [day.key]: { ...prev[day.key], breakStart: value },
                                  }));
                                }}
                              />
                            </Field>
                            <Field>
                              <FieldLabel>Break end</FieldLabel>
                              <Input
                                type="time"
                                value={row.breakEnd}
                                disabled={!row.enabled || !row.hasBreak}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSchedule((prev) => ({
                                    ...prev,
                                    [day.key]: { ...prev[day.key], breakEnd: value },
                                  }));
                                }}
                              />
                            </Field>
                          </div>
                        </div>
                        <label className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={row.hasBreak}
                            disabled={!row.enabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSchedule((prev) => ({
                                ...prev,
                                [day.key]: {
                                  ...prev[day.key],
                                  hasBreak: checked,
                                },
                              }));
                            }}
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
                <Textarea
                  rows={4}
                  value={closedDatesText}
                  onChange={(e) => setClosedDatesText(e.target.value)}
                  placeholder={'2026-12-25\n2026-12-26'}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  Add one `YYYY-MM-DD` date per line for holidays, training days, or any one-off closures.
                </p>
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button
                  disabled={savingRules}
                  onClick={async () => {
                    const enabledDays = WEEKDAYS.filter((day) => schedule[day.key].enabled);
                    if (enabledDays.length === 0) {
                      toast.error('Enable at least one working day');
                      return;
                    }

                    for (const day of enabledDays) {
                      const row = schedule[day.key];
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
                      await saveBookingRules({
                        operatingSchedule: toSchedulePayload(schedule),
                        closedDates: parseClosedDatesText(closedDatesText),
                      }).unwrap();
                      toast.success('Clinic schedule saved');
                      goNext('ai-chat');
                    } catch (err: unknown) {
                      toast.error(getUserFriendlyApiError(err));
                    }
                  }}
                  className="min-w-32"
                >
                  {savingRules ? 'Saving...' : 'Save schedule'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'ai-chat' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">AI configuration chat</CardTitle>
            <CardDescription>
              Configure receptionist behavior as clinic admin. The AI asks clarifying questions based on your context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-hidden rounded-2xl border bg-muted/10">
                <div className="border-b bg-background/80 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <BotIcon className="size-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">DentalFlow Assistant</p>
                      <p className="text-xs text-muted-foreground">
                        Ask for workflows, edge cases, tone, escalation rules, and anything the receptionist should handle your way.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  ref={chatScrollRef}
                  className="h-[520px] space-y-6 overflow-y-auto bg-[radial-gradient(circle_at_top,_hsl(var(--muted))_0%,_transparent_55%)] px-4 py-5 sm:px-5"
                >
                  {configChatMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed bg-background/70 p-6 text-center">
                      <div className="max-w-md space-y-2">
                        <p className="text-sm font-medium">Start the conversation</p>
                        <p className="text-sm text-muted-foreground">
                          Tell the assistant how your front desk should behave and it will ask follow-up questions like ChatGPT.
                        </p>
                      </div>
                    </div>
                  ) : (
                    configChatMessages.map((turn, index) => {
                      const isAssistant = turn.role === 'assistant';
                      return (
                        <div
                          key={`${turn.timestamp}-${index}`}
                          className={`flex gap-3 ${isAssistant ? 'justify-start' : 'justify-end'}`}
                        >
                          {isAssistant && (
                            <Avatar size="sm" className="mt-1">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                <BotIcon className="size-3.5" />
                              </AvatarFallback>
                            </Avatar>
                          )}

                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                              isAssistant
                                ? 'border bg-background text-foreground'
                                : 'bg-primary text-primary-foreground'
                            }`}
                          >
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide opacity-70">
                              <span>{isAssistant ? 'AI assistant' : 'You'}</span>
                            </div>
                            {isAssistant ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0 leading-7">{children}</p>,
                                  h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>,
                                  h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold">{children}</h2>,
                                  h3: ({ children }) => <h3 className="mb-2 text-sm font-medium">{children}</h3>,
                                  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                                  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                                  li: ({ children }) => <li>{children}</li>,
                                  code: ({ children }) => (
                                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>
                                  ),
                                  pre: ({ children }) => (
                                    <pre className="mb-2 overflow-x-auto rounded-md bg-muted p-2 text-xs">{children}</pre>
                                  ),
                                }}
                              >
                                {turn.content}
                              </ReactMarkdown>
                            ) : (
                              <p className="whitespace-pre-wrap leading-7">{turn.content}</p>
                            )}
                          </div>

                          {!isAssistant && (
                            <Avatar size="sm" className="mt-1">
                              <AvatarFallback className="bg-foreground text-background">
                                <UserIcon className="size-3.5" />
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      );
                    })
                  )}

                  {testingAi && (
                    <div className="flex gap-3">
                      <Avatar size="sm" className="mt-1">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <BotIcon className="size-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t bg-background/90 p-4 sm:p-5">
                  <div className="rounded-2xl border bg-background shadow-sm">
                    <Textarea
                      rows={3}
                      value={configChatInput}
                      onChange={(e) => setConfigChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (!testingAi && configChatInput.trim()) {
                            void sendConfigMessage();
                          }
                        }
                      }}
                      placeholder="Message the assistant with clinic workflows, special instructions, edge cases, or receptionist behavior you want to lock in..."
                      className="min-h-[110px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center justify-between gap-3 border-t px-3 py-3">
                      <p className="text-xs text-muted-foreground">
                        Press `Enter` to send, `Shift+Enter` for a new line.
                      </p>
                      <Button
                        type="button"
                        onClick={sendConfigMessage}
                        disabled={testingAi || !configChatInput.trim()}
                        size="icon"
                        className="rounded-full"
                      >
                        <ArrowUpIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Best results</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask for exact behavior, for example how to handle same-day emergencies, pricing questions, reschedules, insurance uncertainty, or when to escalate to staff.
                  </p>
                </div>

                <Field>
                  <FieldLabel>AI context about your clinic</FieldLabel>
                  <div className="max-h-[520px] overflow-y-auto rounded-2xl border bg-muted/20 p-4 text-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                        h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>,
                        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                        li: ({ children }) => <li>{children}</li>,
                        code: ({ children }) => (
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mb-2 overflow-x-auto rounded-md bg-muted p-2 text-xs">{children}</pre>
                        ),
                      }}
                    >
                      {aiClinicContextMarkdown}
                    </ReactMarkdown>
                  </div>
                </Field>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => goNext('test-call')}
                  className="min-w-40"
                >
                  Continue to Test Step
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'test-call' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Review & Go Live</CardTitle>
            <CardDescription>
              Review your configuration and publish to go live
            </CardDescription>
          </CardHeader>
          <CardContent>
            {onboardingData && (
              <div className="mb-6 space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Readiness Score</span>
                  <span className="text-lg font-bold text-primary">{onboardingData.readinessScore}%</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Steps Completed</span>
                  <span className="text-sm">{onboardingData.completedSteps.length} / {STEP_ORDER.length}</span>
                </div>
                {onboardingData.validationErrors.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <p className="mb-1 text-sm font-medium text-destructive">Blocking Issues:</p>
                    {onboardingData.validationErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">{err.message}</p>
                    ))}
                    {hasMissingPoliciesError && (
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={savingPolicies}
                          onClick={async () => {
                            try {
                              await savePolicies({
                                policies: [
                                  {
                                    policyType: 'escalation',
                                    content:
                                      'Escalate to a human team member when the caller asks for clinical advice, has unresolved billing disputes, or requests manager intervention.',
                                  },
                                  {
                                    policyType: 'emergency',
                                    content:
                                      'If the caller reports severe pain, bleeding, trauma, or breathing issues, instruct them to call 911 immediately and notify the on-call staff.',
                                  },
                                ],
                              }).unwrap();
                              await refetchOnboardingStatus();
                              toast.success('Policies fixed. You can publish now.');
                            } catch (err: unknown) {
                              toast.error(getUserFriendlyApiError(err));
                            }
                          }}
                        >
                          {savingPolicies ? 'Fixing...' : 'Fix Policies & Refresh'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {onboardingData.validationWarnings.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                    <p className="mb-1 text-sm font-medium text-yellow-600">Warnings:</p>
                    {onboardingData.validationWarnings.map((warn, i) => (
                      <p key={i} className="text-xs text-yellow-600">{warn.message}</p>
                    ))}
                  </div>
                )}

                {calendarConnected && (
                  <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                    <p className="text-sm font-medium text-green-700">Connected to Google Calendar</p>
                  </div>
                )}

                {hasIntegrationWarning && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <p className="text-sm font-medium">Connect Google Calendar now</p>
                    <Field>
                      <FieldLabel>Google account email (optional)</FieldLabel>
                      <Input
                        type="email"
                        placeholder="frontdesk@clinic.com"
                        value={googleCalendarEmail}
                        onChange={(e) => setGoogleCalendarEmail(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Calendar ID</FieldLabel>
                      <Input
                        placeholder="primary"
                        value={googleCalendarId}
                        onChange={(e) => setGoogleCalendarId(e.target.value)}
                      />
                    </Field>
                    <Button
                      type="button"
                      onClick={async () => {
                        try {
                          await connectGoogleCalendar();
                        } catch (err: unknown) {
                          toast.error(getUserFriendlyApiError(err));
                        }
                      }}
                      disabled={startingGoogleOAuth}
                      className="min-w-44"
                    >
                      {startingGoogleOAuth ? 'Redirecting...' : 'Connect Google Calendar'}
                    </Button>
                  </div>
                )}

              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={goBack} className="min-w-28">
                Back
              </Button>
              <Button
                disabled={publishing || (onboardingData && !onboardingData.isReady)}
                onClick={async () => {
                  try {
                    await publishConfig().unwrap();
                    toast.success('Configuration published! Your AI receptionist is live.');
                    goNext('complete');
                  } catch (err: unknown) {
                    toast.error(getUserFriendlyApiError(err));
                  }
                }}
                className="min-w-36"
              >
                {publishing ? 'Publishing...' : 'Publish & Go Live'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
