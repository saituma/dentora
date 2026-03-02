'use client';

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
              onSubmit={(e) => {
                e.preventDefault();
                goNext('knowledge-base');
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>Clinic name</FieldLabel>
                  <Input placeholder="Smile Dental" required />
                </Field>
                <Field>
                  <FieldLabel>Address</FieldLabel>
                  <Input placeholder="123 Main St" />
                </Field>
                <Field>
                  <FieldLabel>Timezone</FieldLabel>
                  <Select defaultValue="America/New_York">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern</SelectItem>
                      <SelectItem value="America/Los_Angeles">
                        Pacific
                      </SelectItem>
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
                  <Button type="submit" className="min-w-28">
                    Next
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
                <FieldLabel>Voice</FieldLabel>
                <Select defaultValue="rachel">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rachel">Rachel</SelectItem>
                    <SelectItem value="drew">Drew</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Greeting</FieldLabel>
                <Textarea
                  defaultValue="Hi, thank you for calling. How can I help you today?"
                  rows={2}
                />
              </Field>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button onClick={() => goNext('rules')} className="min-w-28">
                  Next
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
            <CardDescription>Set durations and policies</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Default duration (min)</FieldLabel>
                <Input type="number" defaultValue={30} />
              </Field>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={goBack} className="min-w-28">
                  Back
                </Button>
                <Button
                  onClick={() => goNext('integrations')}
                  className="min-w-28"
                >
                  Next
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
            <CardTitle className="text-xl">Test your AI</CardTitle>
            <CardDescription>
              Make a test call to verify everything works
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={goBack} className="min-w-28">
                Back
              </Button>
              <Button onClick={() => goNext('complete')} className="min-w-36">
                Complete setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
