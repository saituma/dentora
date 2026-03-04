'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { FileUpload } from '@/components/file-upload';
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
} from '@/features/onboarding/onboardingApi';

const STEPS = [
  { id: 'clinic-profile', label: 'Profile' },
  { id: 'knowledge-base', label: 'Knowledge' },
  { id: 'voice', label: 'Voice' },
  { id: 'rules', label: 'Rules' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'test-call', label: 'Test' },
  { id: 'complete', label: 'Done' },
];

const STEP_ORDER = STEPS.map((s) => s.id) as OnboardingStep[];

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
    title: 'Upload your clinic knowledge',
    description:
      'Add services, pricing, and FAQs so responses stay accurate and consistent.',
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
  const dispatch = useAppDispatch();
  const { onboardingStatus } = useAppSelector((state) => state.auth);

  const [saveClinicProfile, { isLoading: savingProfile }] = useSaveClinicProfileMutation();
  const [saveServices, { isLoading: savingServices }] = useSaveServicesMutation();
  const [saveBookingRules, { isLoading: savingRules }] = useSaveBookingRulesMutation();
  const [savePolicies] = useSavePoliciesMutation();
  const [saveVoiceProfile, { isLoading: savingVoice }] = useSaveVoiceProfileMutation();
  const [saveFaqs] = useSaveFaqsMutation();
  const [publishConfig, { isLoading: publishing }] = usePublishConfigMutation();
  const { data: onboardingData } = useGetOnboardingStatusQuery();

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

  if (step === 'complete') {
    goNext('complete');
    return null;
  }

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
                } catch (err) {
                  toast.error('Failed to save clinic profile');
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
                  <Select value={timezone} onValueChange={setTimezone}>
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
              Upload services, pricing, and FAQs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload onFileSelect={() => toast.success('File uploaded')} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="outline" onClick={goBack} className="min-w-28">
                Back
              </Button>
              <Button onClick={() => goNext('voice')} className="min-w-28">
                Next
              </Button>
            </div>
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
                    } catch {
                      toast.error('Failed to save voice profile');
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
                      toast.success('Booking rules saved');
                      goNext('integrations');
                    } catch {
                      toast.error('Failed to save booking rules');
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
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={goBack} className="min-w-28">
                Back
              </Button>
              <Button
                onClick={() => goNext('test-call')}
                variant="outline"
                className="min-w-32"
              >
                Skip for now
              </Button>
              <Button onClick={() => goNext('test-call')} className="min-w-36">
                Connect calendar
              </Button>
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
                  <span className="text-sm">{onboardingData.completedSteps.length} / 7</span>
                </div>
                {onboardingData.validationErrors.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <p className="mb-1 text-sm font-medium text-destructive">Blocking Issues:</p>
                    {onboardingData.validationErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">{err.message}</p>
                    ))}
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
                  } catch {
                    toast.error('Failed to publish configuration');
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
