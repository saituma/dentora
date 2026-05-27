'use client';

import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { DentoraAiChat } from '@/components/dentora-ai-chat';

const ONBOARDING_STEPS = [
  { id: 'clinic-profile', label: 'Clinic Profile' },
  { id: 'knowledge-base', label: 'Knowledge Base' },
  { id: 'voice', label: 'Voice Setup' },
  { id: 'phone-number', label: 'Phone Number' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'schedule', label: 'Clinic Schedule' },
  { id: 'clinic-history', label: 'Clinic History' },
  { id: 'ai-chat', label: 'AI Context' },
  { id: 'download', label: 'Export Data' },
  { id: 'test-call', label: 'Review & Publish' },
  { id: 'complete', label: 'Complete' },
] as const;

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAppSelector((state) => state.auth);
  const router = useRouter();
  const pathname = usePathname();
  const activeStepId = pathname?.split('/').filter(Boolean).at(-1) ?? 'clinic-profile';
  const activeStepIndex = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((step) => step.id === activeStepId),
  );
  const activeStep = ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0];
  const totalSteps = ONBOARDING_STEPS.length;

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isHydrated, router]);

  if (!isHydrated) {
    return null;
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-transparent">
      <DentoraAiChat />
      <div className="relative z-10 flex min-h-svh flex-col lg:flex-row">
        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative w-full border-b border-white/10 bg-[#111827] px-5 py-6 sm:px-7 sm:py-8 lg:sticky lg:top-0 lg:h-svh lg:w-[40%] lg:border-b-0 lg:border-r lg:py-10"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-12 h-56 w-56 rounded-full bg-[#4fc3f7]/10 blur-3xl" />
            <div className="absolute bottom-20 right-10 h-40 w-40 rounded-full bg-[#4fc3f7]/5 blur-3xl" />
          </div>
          <div className="relative space-y-8">
            <div>
              <p className="text-xs font-medium text-[#4fc3f7]">Onboarding</p>
              <h1 className="mt-3 font-display text-2xl font-bold text-[#c7d0d9] sm:text-3xl">
                Build your AI front desk
              </h1>
              <p className="mt-2 max-w-md text-sm text-[#c7d0d9]/60">
                Set up your Dentora AI receptionist in a few simple steps — calls, scheduling, and
                patient communication on autopilot.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <p className="text-xs text-[#c7d0d9]/60">
                Step {activeStepIndex + 1} of {totalSteps}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#c7d0d9]">{activeStep.label}</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-[#4fc3f7] transition-all duration-500"
                  style={{ width: `${((activeStepIndex + 1) / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {ONBOARDING_STEPS.map((step, index) => {
                const isActive = index === activeStepIndex;
                const isDone = index < activeStepIndex;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'border-[#4fc3f7]/30 bg-[#4fc3f7]/[0.08] font-medium text-[#c7d0d9]'
                        : isDone
                          ? 'border-white/10 bg-[#111827]/60 text-[#c7d0d9]/60'
                          : 'border-transparent bg-transparent text-[#c7d0d9]/50'
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums font-medium ${
                        isDone
                          ? 'bg-[#4fc3f7] text-white'
                          : isActive
                            ? 'bg-[#4fc3f7]/20 text-[#4fc3f7]'
                            : 'bg-white/5 text-[#c7d0d9]/50'
                      }`}
                    >
                      {isDone ? '✓' : String(index + 1)}
                    </span>
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.aside>

        <div className="w-full lg:w-[60%]">
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut', delay: 0.1 }}
            className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-7 sm:py-10"
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
