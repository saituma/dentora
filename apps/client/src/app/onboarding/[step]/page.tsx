'use client';

import { Stepper } from '@/components/stepper';
import { STEP_META, STEPS } from './onboarding-types';
import { useOnboardingFlow } from './use-onboarding-flow';
import { ClinicProfileStep, PlanStep } from './steps/basic-steps';
import { KnowledgeBaseStep } from './steps/knowledge-step';
import { VoiceStep } from './steps/voice-step';
import { IntegrationsStep, ScheduleStep } from './steps/operations-steps';
import { AiChatStep, DownloadDataStep, TestCallStep } from './steps/context-publish-steps';

function OnboardingStepContent() {
  const flow = useOnboardingFlow();

  if (flow.step === 'complete') {
    flow.goNext('complete');
    return null;
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 max-w-full rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Step {flow.currentStep + 1} of {STEPS.length}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{STEP_META[flow.step].title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{STEP_META[flow.step].description}</p>
          </div>
          <div className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {flow.progressPercent}%
          </div>
        </div>
        <Stepper steps={STEPS as unknown as Array<{ id: string; label: string }>} currentStep={flow.currentStep} />
      </div>

      {flow.step === 'clinic-profile' && <ClinicProfileStep flow={flow} />}
      {flow.step === 'plan' && <PlanStep flow={flow} />}
      {flow.step === 'knowledge-base' && <KnowledgeBaseStep flow={flow} />}
      {flow.step === 'voice' && <VoiceStep flow={flow} />}
      {flow.step === 'integrations' && <IntegrationsStep flow={flow} />}
      {flow.step === 'schedule' && <ScheduleStep flow={flow} />}
      {flow.step === 'ai-chat' && <AiChatStep flow={flow} />}
      {flow.step === 'download' && <DownloadDataStep flow={flow} />}
      {flow.step === 'test-call' && <TestCallStep flow={flow} />}
    </div>
  );
}

export default function OnboardingStepPage() {
  return <OnboardingStepContent />;
}
