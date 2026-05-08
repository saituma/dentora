'use client';

import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { ShatteredToothBg } from '@/components/shattered-tooth-bg';
import { DentoraAiChat } from '@/components/dentora-ai-chat';

const ONBOARDING_STEPS = [
  { id: 'clinic-profile', label: 'Clinic Profile' },
  { id: 'knowledge-base', label: 'Knowledge Base' },
  { id: 'voice', label: 'Voice Setup' },
  { id: 'phone-number', label: 'Phone Number' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'schedule', label: 'Clinic Schedule' },
  { id: 'ai-chat', label: 'AI Context' },
  { id: 'download', label: 'Export Data' },
  { id: 'test-call', label: 'Review & Publish' },
  { id: 'complete', label: 'Complete' },
] as const;

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isHydrated } = useAppSelector((state) => state.auth);
  const router = useRouter();
  const pathname = usePathname();
  const activeStepId = pathname?.split('/').filter(Boolean).at(-1) ?? 'clinic-profile';
  const activeStepIndex = Math.max(0, ONBOARDING_STEPS.findIndex((step) => step.id === activeStepId));
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
    <div className="dark relative min-h-svh overflow-hidden bg-[#0a0e1a]">
      <ShatteredToothBg />
      <DentoraAiChat />
      <div className="relative z-10 flex min-h-svh flex-col lg:flex-row">
        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative w-full border-b border-white/[0.06] px-5 py-7 sm:px-7 lg:sticky lg:top-0 lg:h-svh lg:w-[40%] lg:border-b-0 lg:border-r lg:py-10"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-12 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute bottom-20 right-10 h-40 w-40 rounded-full bg-blue-600/5 blur-3xl" />
          </div>
          <div className="relative space-y-8">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-gray-500">Onboarding</p>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Build your AI front desk
              </h1>
              <p className="mt-2 max-w-md text-sm text-gray-400">
                Set up your Dentora AI receptionist in a few simple steps — calls, scheduling, and patient communication on autopilot.
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5">
              <div className="rounded-[calc(1rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
                  Step {activeStepIndex + 1} / {totalSteps}
                </p>
                <p className="mt-2 text-sm font-medium text-white">{activeStep.label}</p>
              </div>
            </div>

            <div className="space-y-2">
              {ONBOARDING_STEPS.map((step, index) => {
                const isActive = index === activeStepIndex;
                const isDone = index < activeStepIndex;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-xs font-mono uppercase tracking-[0.12em] transition-colors ${
                      isActive
                        ? 'border-blue-500/30 bg-blue-500/[0.08] text-white'
                        : isDone
                          ? 'border-white/[0.1] bg-white/[0.03] text-gray-300'
                          : 'border-white/[0.06] bg-transparent text-gray-600'
                    }`}
                  >
                    <span className="w-6 text-[10px] tabular-nums">{String(index + 1).padStart(2, '0')}</span>
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
