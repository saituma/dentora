'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
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
} from '@/features/onboarding/onboardingApi';
import {
  useStartGoogleCalendarOAuthMutation,
} from '@/features/integrations/integrationsApi';
import { getUserFriendlyApiError } from '@/lib/api-error';

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

export default function OnboardingStepPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { onboardingStatus } = useAppSelector((state) => state.auth);

  const [saveClinicProfile, { isLoading: savingProfile }] = useSaveClinicProfileMutation();
  const [saveServices, { isLoading: savingServices }] = useSaveServicesMutation();
  const [saveBookingRules, { isLoading: savingRules }] = useSaveBookingRulesMutation();
  const [savePolicies, { isLoading: savingPolicies }] = useSavePoliciesMutation();
  const [saveVoiceProfile, { isLoading: savingVoice }] = useSaveVoiceProfileMutation();
  const [saveFaqs, { isLoading: savingFaqs }] = useSaveFaqsMutation();
  const [publishConfig, { isLoading: publishing }] = usePublishConfigMutation();
  const { data: onboardingData, refetch: refetchOnboardingStatus } = useGetOnboardingStatusQuery();
  const [sendConfigChatMessage, { isLoading: testingAi }] = useSendConfigChatMessageMutation();
  const [startGoogleCalendarOAuth, { isLoading: startingGoogleOAuth }] = useStartGoogleCalendarOAuthMutation();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [voiceTone, setVoiceTone] = useState<'professional' | 'warm' | 'friendly' | 'calm'>('professional');
  const [greeting, setGreeting] = useState('Hi, thank you for calling. How can I help you today?');
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(30);
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState('');
  const [googleCalendarId, setGoogleCalendarId] = useState('primary');
  const [handledGoogleCallback, setHandledGoogleCallback] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [testPrompt, setTestPrompt] = useState('Hi, I need to book a cleaning next week.');
  const [testAiResponse, setTestAiResponse] = useState('');
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

  if (step === 'complete') {
    goNext('complete');
    return null;
  }

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

  const configuratorContext = [
    `Clinic name: ${clinicName || 'Not provided yet'}`,
    `Timezone: ${timezone}`,
    `Primary phone: ${phone || 'Not provided yet'}`,
    `Support email: ${email || 'Not provided yet'}`,
    `Voice tone: ${voiceTone}`,
    `Greeting: ${greeting || 'Not provided yet'}`,
    `Default appointment duration: ${defaultDuration} minutes`,
    `Cancellation notice: ${cancellationHours} hours`,
    `Advance booking window: ${advanceBookingDays} days`,
    `Services configured: ${servicesForm.filter((service) => service.serviceName.trim().length > 0).length}`,
    `FAQs configured: ${faqsForm.filter((faq) => faq.question.trim().length > 0 && faq.answer.trim().length > 0).length}`,
    `Google Calendar connected: ${googleCalendarConnected || !hasIntegrationWarning ? 'yes' : 'no'}`,
    `Readiness score: ${onboardingData?.readinessScore ?? 0}%`,
  ].join('\n');

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
        <Card className="border-0 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Voice & tone</CardTitle>
            <CardDescription>Choose your AI receptionist voice</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Tone</FieldLabel>
                <Select value={voiceTone} onValueChange={(v) => setVoiceTone(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="calm">Calm</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Greeting</FieldLabel>
                <Textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  rows={2}
                />
              </Field>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button
                  disabled={savingVoice}
                  onClick={async () => {
                    try {
                      await saveVoiceProfile({ tone: voiceTone, greeting }).unwrap();
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
            </FieldGroup>
          </CardContent>
        </Card>
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
              Configure receptionist behavior as clinic admin and validate responses before go-live
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Field>
                <FieldLabel>Configuration instructions for your AI receptionist</FieldLabel>
                <Textarea
                  rows={4}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="Example: I am the clinic CEO. Keep tone warm but concise, prioritize same-day emergencies, and escalate billing disputes to manager."
                />
              </Field>
              <Field>
                <FieldLabel>Context AI is using from previous onboarding steps</FieldLabel>
                <Textarea
                  rows={10}
                  value={configuratorContext}
                  readOnly
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    if (!testPrompt.trim()) {
                      toast.error('Enter configuration instructions first');
                      return;
                    }

                    try {
                      const result = await sendConfigChatMessage({
                        message: `${testPrompt.trim()}\n\n[CONFIG_CONTEXT]\n${configuratorContext}`,
                        conversationHistory: [
                          {
                            role: 'user',
                            content: `${testPrompt.trim()}\n\n[CONFIG_CONTEXT]\n${configuratorContext}`,
                            timestamp: new Date().toISOString(),
                          },
                        ],
                      }).unwrap();
                      setTestAiResponse(result.response);
                      toast.success('Configuration response generated');
                    } catch (err: unknown) {
                      toast.error(getUserFriendlyApiError(err));
                    }
                  }}
                  disabled={testingAi}
                  className="min-w-36"
                >
                  {testingAi ? 'Configuring...' : 'Send Config to AI'}
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
              {testAiResponse && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">AI configuration reply</p>
                  <p className="text-sm">{testAiResponse}</p>
                </div>
              )}
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
