'use client';

import React, { useEffect, useState } from 'react';
import { PlayIcon, PauseIcon } from 'lucide-react';
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
  useGenerateVoicePreviewMutation,
  usePublishConfigMutation,
  useGetOnboardingStatusQuery,
  useSendConfigChatMessageMutation,
} from '@/features/onboarding/onboardingApi';
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
import { VoicePreviewCard, type VoiceOption } from '@/components/voice-preview-card';
import {
  RECEPTIONIST_VOICE_OPTIONS,
  getReceptionistVoiceByAccentAndGender,
  getReceptionistVoiceById,
  type ReceptionistVoiceAccent,
  type ReceptionistVoiceGender,
} from '@/lib/voice-catalog';

const VOICE_OPTIONS: VoiceOption[] = RECEPTIONIST_VOICE_OPTIONS;

const STEPS = [
  { id: 'clinic-profile', label: 'Profile' },
  { id: 'knowledge-base', label: 'Knowledge' },
  { id: 'voice', label: 'Voice' },
  { id: 'rules', label: 'Rules' },
  { id: 'integrations', label: 'Integrations' },
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
      'Pick a voice and greeting style that matches your brand and patient experience.',
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

function GreetingPlayer({ src }: { src: string }) {
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
        {playing ? 'Playing greeting...' : 'Play greeting preview'}
      </span>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
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
  const [generateVoicePreview] = useGenerateVoicePreviewMutation();
  const [saveFaqs, { isLoading: savingFaqs }] = useSaveFaqsMutation();
  const [publishConfig, { isLoading: publishing }] = usePublishConfigMutation();
  const { data: onboardingData, refetch: refetchOnboardingStatus } = useGetOnboardingStatusQuery();
  const { data: clinicData } = useGetClinicQuery();
  const { data: voiceProfileData } = useGetVoiceProfileQuery();
  const { data: bookingRulesData } = useGetBookingRulesQuery();
  const { data: servicesData } = useGetServicesQuery();
  const { data: faqsData } = useGetFaqsQuery();
  const [sendConfigChatMessage, { isLoading: testingAi }] = useSendConfigChatMessageMutation();
  const [startGoogleCalendarOAuth, { isLoading: startingGoogleOAuth }] = useStartGoogleCalendarOAuthMutation();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [voiceTone, setVoiceTone] = useState<'professional' | 'warm' | 'friendly' | 'calm'>('professional');
  const [greeting, setGreeting] = useState('Hi, thank you for calling. How can I help you today?');
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICE_OPTIONS[0].id);
  const [selectedAccent, setSelectedAccent] = useState<ReceptionistVoiceAccent>('us');
  const [selectedGender, setSelectedGender] = useState<ReceptionistVoiceGender>('female');
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
  const [voicePreviewUrls, setVoicePreviewUrls] = useState<Record<string, string>>({});
  const [generatingPreviewFor, setGeneratingPreviewFor] = useState<string | null>(null);
  const [greetingPreviewUrl, setGreetingPreviewUrl] = useState<string | null>(null);
  const [generatingGreetingPreview, setGeneratingGreetingPreview] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(30);
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState('');
  const [googleCalendarId, setGoogleCalendarId] = useState('primary');
  const [handledGoogleCallback, setHandledGoogleCallback] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [configChatInput, setConfigChatInput] = useState('');
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

  useEffect(() => {
    if (!voiceProfileData) return;

    const matchedVoice = getReceptionistVoiceById(voiceProfileData.voiceId);
    if (matchedVoice) {
      setSelectedVoiceId(matchedVoice.id);
      setSelectedAccent(matchedVoice.accent);
      setSelectedGender(matchedVoice.gender);
      setVoiceTone(matchedVoice.toneValue);
    }

    if (voiceProfileData.greetingMessage) {
      setGreeting(voiceProfileData.greetingMessage);
    }

    if (voiceProfileData.speechSpeed) {
      setSpeakingSpeed(Number(voiceProfileData.speechSpeed));
    }
  }, [voiceProfileData]);

  useEffect(() => {
    const preferredVoice = getReceptionistVoiceByAccentAndGender(selectedAccent, selectedGender);
    setSelectedVoiceId(preferredVoice.id);
    setVoiceTone(preferredVoice.toneValue);
    setGreetingPreviewUrl(null);
  }, [selectedAccent, selectedGender]);

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
    }).unwrap();

    window.location.assign(result.authUrl);
  };

  const hasIntegrationWarning = onboardingData
    ? onboardingData.validationWarnings.some((warn) => warn.message === 'No integrations configured')
    : false;
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
    `Google Calendar connected: ${googleCalendarConnected || !hasIntegrationWarning ? 'yes' : 'no'}`,
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
                Pick a US or UK receptionist voice, then choose male or female delivery.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-5 grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Accent</FieldLabel>
                  <Select
                    value={selectedAccent}
                    onValueChange={(value) => setSelectedAccent((value as ReceptionistVoiceAccent) || 'us')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">US accent agent</SelectItem>
                      <SelectItem value="uk">UK accent agent</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Voice</FieldLabel>
                  <Select
                    value={selectedGender}
                    onValueChange={(value) => setSelectedGender((value as ReceptionistVoiceGender) || 'female')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {VOICE_OPTIONS.map((voice) => (
                  <VoicePreviewCard
                    key={voice.id}
                    voice={voice}
                    selected={selectedVoiceId === voice.id}
                    previewAudioUrl={voicePreviewUrls[voice.id] ?? null}
                    isGenerating={generatingPreviewFor === voice.id}
                    onSelect={(id) => {
                      const selectedVoice = getReceptionistVoiceById(id);
                      if (!selectedVoice) return;
                      setSelectedVoiceId(id);
                      setSelectedAccent(selectedVoice.accent);
                      setSelectedGender(selectedVoice.gender);
                      setVoiceTone(selectedVoice.toneValue);
                      setGreetingPreviewUrl(null);
                    }}
                    onPreview={async (id) => {
                      const previewVoice = getReceptionistVoiceById(id);
                      setGeneratingPreviewFor(id);
                      try {
                        const url = await generateVoicePreview({
                          voiceId: id,
                          text: 'Hi, thank you for calling. I am your AI dental receptionist. How can I help you today?',
                          speed: speakingSpeed,
                          language: previewVoice?.locale ?? 'en-US',
                        }).unwrap();
                        setVoicePreviewUrls((prev) => ({ ...prev, [id]: url }));
                      } catch {
                        toast.error('Could not generate voice preview. Please try again.');
                      } finally {
                        setGeneratingPreviewFor(null);
                      }
                    }}
                  />
                ))}
              </div>
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
                    // Clear previews when speed changes since they were generated at old speed
                    setVoicePreviewUrls({});
                    setGreetingPreviewUrl(null);
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
                      setGreetingPreviewUrl(null);
                    }}
                    rows={3}
                    placeholder="Hi, thank you for calling Bright Smile Dental. How can I assist you today?"
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={generatingGreetingPreview || !greeting.trim()}
                  onClick={async () => {
                    setGeneratingGreetingPreview(true);
                    try {
                      const selectedVoice = getReceptionistVoiceById(selectedVoiceId);
                      const url = await generateVoicePreview({
                        voiceId: selectedVoiceId,
                        text: greeting.trim(),
                        speed: speakingSpeed,
                        language: selectedVoice?.locale ?? 'en-US',
                      }).unwrap();
                      setGreetingPreviewUrl(url);
                    } catch {
                      toast.error('Could not preview greeting. Please try again.');
                    } finally {
                      setGeneratingGreetingPreview(false);
                    }
                  }}
                >
                  {generatingGreetingPreview ? (
                    <>Generating...</>
                  ) : (
                    <>Preview my greeting</>
                  )}
                </Button>
                {greetingPreviewUrl && (
                  <GreetingPlayer src={greetingPreviewUrl} />
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
                  const selectedVoice = getReceptionistVoiceById(selectedVoiceId);
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
              Connect your calendar (optional - can skip)
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
                <Button
                  onClick={() => goNext('ai-chat')}
                  variant="outline"
                  className="min-w-32"
                  type="button"
                >
                  Skip for now
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

      {step === 'ai-chat' && (
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">AI configuration chat</CardTitle>
            <CardDescription>
              Configure receptionist behavior as clinic admin. The AI asks clarifying questions based on your context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Field>
                <FieldLabel>Configuration chat</FieldLabel>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                  {configChatMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Send a message to start. The AI will ask focused follow-up questions until your setup is clear.
                    </p>
                  ) : (
                    configChatMessages.map((turn, index) => (
                      <div
                        key={`${turn.timestamp}-${index}`}
                        className={`rounded-md p-2 text-sm ${
                          turn.role === 'user'
                            ? 'ml-8 bg-primary/10 text-foreground'
                            : 'mr-8 bg-background border'
                        }`}
                      >
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {turn.role === 'user' ? 'You' : 'AI'}
                        </p>
                        {turn.role === 'assistant' ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
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
                          <p className="whitespace-pre-wrap">{turn.content}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Field>
              <Field>
                <FieldLabel>Your message</FieldLabel>
                <Textarea
                  rows={4}
                  value={configChatInput}
                  onChange={(e) => setConfigChatInput(e.target.value)}
                  placeholder="Example: I am the clinic CEO. Keep tone warm but concise, prioritize same-day emergencies, and escalate billing disputes to manager."
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={sendConfigMessage}
                    disabled={testingAi}
                    className="min-w-32"
                  >
                    {testingAi ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel>AI context about your clinic</FieldLabel>
                <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm">
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

                {(googleCalendarConnected || !hasIntegrationWarning) && (
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
